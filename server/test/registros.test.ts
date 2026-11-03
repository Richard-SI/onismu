import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db.js";
import { app, criarUniversidade, entrar, evidencia, iniciativaBase, limparBanco } from "./ajuda.js";

beforeEach(limparBanco);

describe("universidades", () => {
  it("cria pela administração e consulta publicamente (item 1)", async () => {
    const adm = await entrar();
    const r = await adm.post("/api/admin/universidades", {
      nome_oficial: "Universidade Federal do Rio Grande", sigla: "FURG", categoria_administrativa: "publica_federal",
      estado: "rs", municipio: "Rio Grande", site_oficial: "https://www.furg.br", dominio: "furg.br",
    });
    expect(r.status).toBe(201);
    expect(r.body.regiao).toBe("Sul");
    expect(r.body.situacao_pesquisa).toBe("nao_pesquisada");

    const lista = await request(app).get("/api/publico/universidades?estado=RS");
    expect(lista.body.total).toBe(1);
    const det = await request(app).get(`/api/publico/universidades/${r.body.id}`);
    expect(det.status).toBe(200);
    expect(det.body.sigla).toBe("FURG");
    expect(det.body.pendencias).toContain("Instituição ainda não pesquisada.");
    const hist = await pool.query("SELECT count(*) AS n FROM historico_alteracoes WHERE entidade = 'universidades' AND registro_id = $1", [r.body.id]);
    expect(hist.rows[0].n).toBeGreaterThan(0);
  });

  it("rejeita UF e URL inválidas", async () => {
    const adm = await entrar();
    const r = await adm.post("/api/admin/universidades", { nome_oficial: "Universidade X", categoria_administrativa: "publica_federal", estado: "ZZ", site_oficial: "javascript:alert(1)" });
    expect(r.status).toBe(400);
    expect(r.body.detalhes.map((d: any) => d.campo)).toEqual(expect.arrayContaining(["estado", "site_oficial"]));
  });

  it("não permite declarar pesquisa concluída sem fontes consultadas (itens 17)", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const r = await adm.post(`/api/admin/universidades/${uid}/situacao`, { acao: "concluir", justificativa: "teste de conclusão" });
    expect(r.status).toBe(422);
    const manual = await adm.post(`/api/admin/universidades/${uid}/situacao`, { acao: "definir", situacao: "concluida_sem_iniciativas", justificativa: "atalho indevido" });
    expect(manual.status).toBe(400);
    const u = await pool.query("SELECT situacao_pesquisa FROM universidades WHERE id = $1", [uid]);
    expect(u.rows[0].situacao_pesquisa).toBe("nao_pesquisada");
  });
});

describe("iniciativas", () => {
  it("cria, relaciona com universidade e fonte, e aparece no catálogo (itens 2 e 3)", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade({ sigla: "UFX" });
    const r = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { evidencias: [evidencia(1), evidencia(2)] }));
    expect(r.status).toBe(201);
    const det = await request(app).get(`/api/publico/iniciativas/${r.body.id}`);
    expect(det.status).toBe(200);
    expect(det.body.universidade_sigla).toBe("UFX");
    expect(det.body.evidencias).toHaveLength(2);
    expect(det.body.evidencias[0].url_original).toMatch(/^https:\/\/www\.exemplo-teste\.br/);

    // A mesma fonte pode comprovar outra iniciativa sem duplicar a fonte.
    const r2 = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { nome: "Projeto Rodas de Conversa", categoria_principal: "projeto_extensao" }));
    expect(r2.status).toBe(201);
    const fontes = await pool.query("SELECT count(*) AS n FROM fontes");
    expect(fontes.rows[0].n).toBe(2);
    const usos = await pool.query("SELECT count(*) AS n FROM evidencias WHERE fonte_id = (SELECT id FROM fontes WHERE url_canonica = 'exemplo-teste.br/pagina-1')");
    expect(usos.rows[0].n).toBe(2);
  });

  it("valida categorias da taxonomia (item 4)", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const inexistente = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { categoria_principal: "categoria_inventada" }));
    expect(inexistente.status).toBe(400);
    const repetida = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { categorias_secundarias: ["servico_permanente"] }));
    expect(repetida.status).toBe(400);
    await pool.query("UPDATE categorias SET ativa = false WHERE codigo = 'acao_pontual'");
    const inativa = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { categoria_principal: "acao_pontual" }));
    expect(inativa.status).toBe(400);
    await pool.query("UPDATE categorias SET ativa = true WHERE codigo = 'acao_pontual'");
    const ok = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { categorias_secundarias: ["pesquisa_formacao"] }));
    expect(ok.status).toBe(201);
  });

  it("exige evidência para validar e documento normativo para o Nível 1", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const semEvidencia = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { evidencias: [] }));
    expect(semEvidencia.status).toBe(422);
    const nivel1 = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { categoria_principal: "politica_institucional", grau_evidencia: 1 }));
    expect(nivel1.status).toBe(422);
    const doc = await adm.post("/api/admin/documentos", { titulo: "Resolução 1/2024", tipo_documento: "resolucao", universidade_id: uid, url_original: "https://www.exemplo-teste.br/res.pdf" });
    const comDoc = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { categoria_principal: "politica_institucional", grau_evidencia: 1, documentos_ids: [doc.body.id] }));
    expect(comDoc.status).toBe(201);
    // Iniciativa pendente não aparece publicamente.
    const pend = await adm.post("/api/admin/iniciativas", iniciativaBase(uid, { nome: "Pendente", status_validacao: "pendente", evidencias: [] }));
    expect((await request(app).get(`/api/publico/iniciativas/${pend.body.id}`)).status).toBe(404);
  });

  it("filtra, ordena e pagina o catálogo (item 6)", async () => {
    const adm = await entrar();
    const rs = await criarUniversidade({ sigla: "URS", uf: "RS", regiao: "Sul" });
    const pa = await criarUniversidade({ nome: "Universidade do Norte", sigla: "UNO", uf: "PA", regiao: "Norte", cat: "publica_estadual" });
    for (let i = 0; i < 5; i++) await adm.post("/api/admin/iniciativas", iniciativaBase(rs, { nome: `Serviço de acolhimento ${i}` }));
    await adm.post("/api/admin/iniciativas", iniciativaBase(pa, { nome: "Projeto Cuidar", categoria_principal: "projeto_extensao", publicos: ["docentes"] }));

    const p1 = await request(app).get("/api/publico/iniciativas?por_pagina=2&pagina=1&ordenar=nome");
    expect(p1.body.total).toBe(6);
    expect(p1.body.itens).toHaveLength(2);
    expect(p1.body.total_paginas).toBe(3);
    const p3 = await request(app).get("/api/publico/iniciativas?por_pagina=2&pagina=3&ordenar=nome");
    expect(p3.body.itens).toHaveLength(2);

    expect((await request(app).get("/api/publico/iniciativas?regiao=Norte")).body.total).toBe(1);
    expect((await request(app).get("/api/publico/iniciativas?estado=RS&categoria=servico_permanente")).body.total).toBe(5);
    expect((await request(app).get("/api/publico/iniciativas?publico=docentes")).body.total).toBe(1);
    expect((await request(app).get("/api/publico/iniciativas?categoria_administrativa=publica_estadual")).body.total).toBe(1);
    expect((await request(app).get("/api/publico/iniciativas?q=acolhimento")).body.total).toBe(5);
    expect((await request(app).get("/api/publico/iniciativas?q=CUIDÁR")).body.total).toBe(1); // sem acento/caixa
    expect((await request(app).get("/api/publico/iniciativas?tem_documento_normativo=true")).body.total).toBe(0);
    expect((await request(app).get("/api/publico/iniciativas?grau_evidencia=3,4")).body.total).toBe(6);
    expect((await request(app).get("/api/publico/iniciativas?por_pagina=999")).status).toBe(400);
  });

  it("registra histórico ao editar", async () => {
    const adm = await entrar();
    const uid = await criarUniversidade();
    const r = await adm.post("/api/admin/iniciativas", iniciativaBase(uid));
    const ed = await adm.put(`/api/admin/iniciativas/${r.body.id}`, iniciativaBase(uid, { nome: "Serviço de Psicologia Aplicada", evidencias: [], justificativa: "nome oficial corrigido" }));
    expect(ed.status).toBe(200);
    const h = await adm.get(`/api/admin/historico?entidade=iniciativas&registro_id=${r.body.id}`);
    const mudanca = h.body.itens.find((x: any) => x.campo === "nome" && x.valor_novo === "Serviço de Psicologia Aplicada");
    expect(mudanca.valor_anterior).toBe("Serviço de Atendimento Psicológico");
    expect(mudanca.justificativa).toBe("nome oficial corrigido");
    expect(mudanca.responsavel).toBeTruthy();
  });
});
