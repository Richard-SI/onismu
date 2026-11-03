import ExcelJS from "exceljs";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db.js";
import { celulaSegura, gerarCsv } from "../src/lib/planilhas.js";
import { app, criarUniversidade, entrar, iniciativaBase, limparBanco } from "./ajuda.js";

beforeEach(limparBanco);

async function candidato(uid: number, extra: Record<string, unknown> = {}) {
  const e = await pool.query(
    `INSERT INTO coleta_execucoes (identificador, universidade_id, modo, ferramenta, status) VALUES ($1,$2,'urls_manuais','teste','concluida') RETURNING id`,
    [`T-${Math.random()}`, uid]);
  const c = await pool.query(
    `INSERT INTO candidatos (execucao_id, universidade_id, extrator, dados, nome, categoria_sugerida, url_fonte, tipo_fonte, trecho_evidencia,
                             grau_evidencia_sugerido, confianca)
     VALUES ($1,$2,'teste',$3,$4,$5,'https://www.exemplo-teste.br/c','site_institucional','Trecho de evidência do candidato para revisão.',3,'media') RETURNING id`,
    [e.rows[0].id, uid, { publico_alvo: ["estudantes", "algo_desconhecido"], situacao_aparente: "ativa", ...extra }, extra.nome ?? "Plantão Psicológico", extra.categoria ?? "servico_permanente"]);
  return c.rows[0].id as number;
}

describe("aprovação e rejeição de candidatos (item 10)", () => {
  it("aprova, criando iniciativa validada com evidência; impede decidir duas vezes", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const cid = await candidato(uid);
    const r = await adm.post(`/api/admin/candidatos/${cid}/aprovar`, {});
    expect(r.status).toBe(200);
    const ini = (await request(app).get(`/api/publico/iniciativas/${r.body.iniciativa_id}`)).body;
    expect(ini.publicos).toEqual(expect.arrayContaining(["estudantes", "outros"]));
    expect(ini.situacao_documentada).toBe("ativa");
    expect(ini.evidencias).toHaveLength(1);
    expect((await adm.post(`/api/admin/candidatos/${cid}/aprovar`, {})).status).toBe(409);
  });

  it("rejeita com motivo obrigatório; rejeitado nunca é publicado", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const cid = await candidato(uid);
    expect((await adm.post(`/api/admin/candidatos/${cid}/rejeitar`, {})).status).toBe(400);
    expect((await adm.post(`/api/admin/candidatos/${cid}/rejeitar`, { motivo: "Página não trata de saúde mental" })).status).toBe(200);
    const c = (await pool.query("SELECT status, motivo_decisao, decidido_por FROM candidatos WHERE id = $1", [cid])).rows[0];
    expect(c).toMatchObject({ status: "rejeitado", motivo_decisao: "Página não trata de saúde mental" });
    expect((await request(app).get("/api/publico/iniciativas")).body.total).toBe(0);
  });

  it("marca como inconclusivo, solicita nova coleta e vincula a iniciativa existente", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const inc = await candidato(uid);
    expect((await adm.post(`/api/admin/candidatos/${inc}/inconclusivo`, { motivo: "Página desatualizada" })).status).toBe(200);
    const rec = await candidato(uid);
    expect((await adm.post(`/api/admin/candidatos/${rec}/recoleta`, { motivo: "Fonte fora do ar" })).status).toBe(200);
    const existente = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { nome: "Plantão Psicológico" }));
    const vinc = await candidato(uid);
    const det = (await adm.get(`/api/admin/candidatos/${vinc}`)).body;
    expect(det.possiveis_duplicatas_atuais.some((d: any) => d.tipo === "iniciativa" && d.id === existente.body.id)).toBe(true);
    expect((await adm.post(`/api/admin/candidatos/${vinc}/vincular`, { iniciativa_id: existente.body.id })).status).toBe(200);
    const pub = (await request(app).get(`/api/publico/iniciativas/${existente.body.id}`)).body;
    expect(pub.evidencias).toHaveLength(2);
    expect((await pool.query("SELECT count(*) AS n FROM iniciativas")).rows[0].n).toBe(1);
  });
});

describe("detecção de possíveis duplicidades (item 9)", () => {
  it("registra pares semelhantes para revisão e não exclui nada automaticamente", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const outra = await criarUniversidade({ nome: "Outra Universidade", sigla: "OU" });
    const a = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { nome: "Programa de Acolhimento Psicológico ao Estudante" }));
    const b = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { nome: "Programa de Acolhimento Psicologico aos Estudantes", evidencias: [{ ...iniciativaBase(uid).evidencias[0], url: "https://www.exemplo-teste.br/outra" }] }));
    await adm.post("/api/admin/iniciativas", iniciativaBase(outra, { nome: "Programa de Acolhimento Psicológico ao Estudante" }));
    await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { nome: "Semana Acadêmica de Biologia", categoria_principal: "acao_pontual", evidencias: [{ ...iniciativaBase(uid).evidencias[0], url: "https://www.exemplo-teste.br/bio" }] }));
    const dups = (await adm.get("/api/admin/duplicidades")).body.itens;
    expect(dups).toHaveLength(1); // somente na mesma universidade, somente nomes semelhantes
    expect([dups[0].iniciativa_a, dups[0].iniciativa_b].sort()).toEqual([a.body.id, b.body.id].sort());
    expect((await pool.query("SELECT count(*) AS n FROM iniciativas")).rows[0].n).toBe(4);

    const ok = await adm.post(`/api/admin/duplicidades/${dups[0].id}/resolver`, { acao: "confirmar", manter_id: a.body.id, justificativa: "Mesmo programa" });
    expect(ok.status).toBe(200);
    const arquivada = (await pool.query("SELECT status_validacao FROM iniciativas WHERE id = $1", [b.body.id])).rows[0];
    expect(arquivada.status_validacao).toBe("arquivada");
    const mantida = (await request(app).get(`/api/publico/iniciativas/${a.body.id}`)).body;
    expect(mantida.evidencias).toHaveLength(2); // evidências transferidas
    expect(mantida.relacoes).toHaveLength(0); // relação de duplicata não aparece publicamente
  });
});

describe("exportação (item 8)", () => {
  it("protege contra CSV injection", () => {
    expect(celulaSegura("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(celulaSegura("+55")).toBe("'+55");
    expect(celulaSegura("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celulaSegura("texto normal")).toBe("texto normal");
    const csv = gerarCsv([{ a: '=1+1', b: 'com "aspas", vírgula' }], [
      { chave: "a", titulo: "a", valor: (r) => r.a }, { chave: "b", titulo: "b", valor: (r) => r.b }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"com ""aspas"", vírgula"');
  });

  it("exporta CSV e XLSX respeitando filtros, com identificadores e links de fontes", async () => {
    const adm = await entrar();
    const rs = await criarUniversidade({ sigla: "URS" });
    const pe = await criarUniversidade({ nome: "Universidade do Nordeste", sigla: "UNE", uf: "PE", regiao: "Nordeste" });
    await adm.post("/api/admin/iniciativas", iniciativaBase(rs, { nome: "=cmd|' /C calc'!A0" }));
    await adm.post("/api/admin/iniciativas", iniciativaBase(pe, { nome: "Projeto Nordeste", categoria_principal: "projeto_extensao" }));
    await adm.post("/api/admin/iniciativas", iniciativaBase(pe, { nome: "Pendente oculta", status_validacao: "pendente", evidencias: [] }));

    const csv = await request(app).get("/api/publico/exportar/iniciativas.csv?estado=RS");
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    const linhas = csv.text.trim().split("\r\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toContain("id_iniciativa");
    expect(linhas[1]).toContain("'=cmd");
    expect(linhas[1]).toContain("https://www.exemplo-teste.br/pagina-1");
    expect(csv.text).not.toContain("Pendente oculta");

    const ext = await request(app).get("/api/publico/exportar/extensao.csv");
    expect(ext.text).toContain("Projeto Nordeste");
    expect(ext.text).not.toContain("cmd");

    const xlsx = await request(app).get("/api/publico/exportar/universidades.xlsx").buffer(true).parse((res, cb) => {
      const partes: Buffer[] = []; res.on("data", (c: Buffer) => partes.push(c)); res.on("end", () => cb(null, Buffer.concat(partes)));
    });
    expect(xlsx.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body);
    expect(wb.getWorksheet("universidades")!.rowCount).toBe(3);
    expect(wb.getWorksheet("Sobre")).toBeTruthy();

    const ind = await request(app).get("/api/publico/exportar/indicadores.csv");
    expect(ind.text).toContain("cobertura_pesquisa");
    const pdf = await request(app).get("/api/publico/relatorio.pdf");
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
  });
});
