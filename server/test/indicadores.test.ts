import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db.js";
import { app, criarUniversidade, entrar, iniciativaBase, limparBanco } from "./ajuda.js";

beforeEach(limparBanco);

async function cenario() {
  const adm = await entrar();
  const a = await criarUniversidade({ sigla: "UA", situacao: "concluida_sem_iniciativas", uf: "RS", regiao: "Sul" });
  const b = await criarUniversidade({ nome: "Universidade B", sigla: "UB", situacao: "concluida_sem_iniciativas", uf: "PE", regiao: "Nordeste" });
  const c = await criarUniversidade({ nome: "Universidade C", sigla: "UC", situacao: "nao_pesquisada", uf: "SP", regiao: "Sudeste" });
  const d = await criarUniversidade({ nome: "Universidade D", sigla: "UD", situacao: "inconclusiva", uf: "PA", regiao: "Norte" });
  const doc = await adm.post("/api/admin/documentos", { titulo: "Resolução 7/2023", tipo_documento: "resolucao", universidade_id: a });
  await adm.post("/api/admin/iniciativas", iniciativaBase(a, { nome: "Política de Saúde Mental", categoria_principal: "politica_institucional", grau_evidencia: 1, documentos_ids: [doc.body.id] }));
  await adm.post("/api/admin/iniciativas", iniciativaBase(a, { nome: "Projeto de extensão Acolher", categoria_principal: "projeto_extensao" }));
  await adm.post("/api/admin/iniciativas", iniciativaBase(a, { nome: "Serviço de psicologia" }));
  await adm.post("/api/admin/iniciativas", iniciativaBase(c, { nome: "Campanha Setembro Amarelo", categoria_principal: "acao_pontual" }));
  // Pendente: não pode entrar nos indicadores validados.
  await adm.post("/api/admin/iniciativas", iniciativaBase(b, { nome: "Algo pendente", status_validacao: "pendente", evidencias: [] }));
  // Demonstrativa: excluída por padrão.
  const demo = await criarUniversidade({ nome: "Universidade Demo", sigla: "DEMO", origem: "demonstrativo", situacao: "concluida_com_iniciativas" });
  await pool.query(
    `INSERT INTO iniciativas (nome, slug, universidade_id, categoria_principal_id, status_validacao, origem_dados)
     VALUES ('Fictícia', 'demo-ficticia', $1, (SELECT id FROM categorias WHERE codigo = 'servico_permanente'), 'validada', 'demonstrativo')`, [demo]);
  return { adm, a, b, c, d, demo };
}

describe("indicadores", () => {
  it("calcula indicadores com numeradores e denominadores explícitos (item 5)", async () => {
    await cenario();
    const r = await request(app).get("/api/publico/indicadores");
    expect(r.status).toBe(200);
    const i = r.body;
    expect(i.universo).toBe(4); // a demonstrativa fica fora
    // A conclui com iniciativas (recalculado automaticamente), B concluída sem iniciativas.
    expect(i.situacao_pesquisa.concluida_com_iniciativas).toBe(1);
    expect(i.situacao_pesquisa.concluida_sem_iniciativas).toBe(1);
    expect(i.situacao_pesquisa.nao_pesquisada).toBe(1);
    expect(i.situacao_pesquisa.inconclusiva).toBe(1);
    expect(i.indicadores.cobertura_pesquisa).toMatchObject({ numerador: 2, denominador: 4, valor: 50 });
    expect(i.indicadores.universidades_com_iniciativas).toMatchObject({ numerador: 1, denominador: 2, valor: 50 });
    expect(i.indicadores.cobertura_documental_politicas).toMatchObject({ numerador: 1, denominador: 2, valor: 50 });
    expect(i.iniciativas_validadas).toBe(4);
    expect(i.politicas_formalizadas).toBe(1);
    expect(i.em_validacao.iniciativas_pendentes).toBe(1);
    expect(i.cobertura_incompleta).toBe(true);
    // UC não está concluída: tem iniciativa, mas não entra no numerador de "universidades com iniciativas".
    expect(i.universidades_com_iniciativas_validadas).toBe(2);
  });

  it("separa dados demonstrativos dos reais (item 16)", async () => {
    await cenario();
    const real = await request(app).get("/api/publico/indicadores");
    const comDemo = await request(app).get("/api/publico/indicadores?demo=true");
    expect(comDemo.body.universo).toBe(real.body.universo + 1);
    expect(comDemo.body.iniciativas_validadas).toBe(real.body.iniciativas_validadas + 1);
    const cat = await request(app).get("/api/publico/iniciativas?q=Fictícia");
    expect(cat.body.total).toBe(0);
    const catDemo = await request(app).get("/api/publico/iniciativas?q=Fictícia&demo=true");
    expect(catDemo.body.itens[0].origem_dados).toBe("demonstrativo");
  });

  it("mantém gráficos consistentes com os registros do banco (item 18)", async () => {
    await cenario();
    const ind = (await request(app).get("/api/publico/indicadores")).body;
    const soma = ind.por_categoria.itens.reduce((s: number, c: any) => s + c.n, 0);
    expect(soma).toBe(ind.por_categoria.denominador);
    const direto = await pool.query("SELECT count(*) AS n FROM iniciativas WHERE status_validacao = 'validada' AND origem_dados = 'real'");
    expect(soma).toBe(direto.rows[0].n);
    const somaSituacoes = Object.values(ind.situacao_pesquisa).reduce((s: number, n: any) => s + n, 0);
    expect(somaSituacoes).toBe(ind.universo);
    const mapa = (await request(app).get("/api/publico/mapa")).body;
    expect(mapa.reduce((s: number, uf: any) => s + uf.iniciativas_validadas, 0)).toBe(ind.iniciativas_validadas);
    expect(mapa.reduce((s: number, uf: any) => s + uf.universidades, 0)).toBe(ind.universo);
    const regioes = ind.por_regiao.reduce((s: number, r: any) => s + r.iniciativas_validadas, 0);
    expect(regioes).toBe(ind.iniciativas_validadas);
    const catalogo = await request(app).get("/api/publico/iniciativas?por_pagina=1");
    expect(catalogo.body.total).toBe(ind.iniciativas_validadas);
  });

  it("filtra indicadores por região", async () => {
    await cenario();
    const sul = (await request(app).get("/api/publico/indicadores?regiao=Sul")).body;
    expect(sul.universo).toBe(1);
    expect(sul.iniciativas_validadas).toBe(3);
    expect(sul.indicadores.cobertura_pesquisa.valor).toBe(100);
  });

  it("compara universidades, distinguindo situações de pesquisa (item 7)", async () => {
    const { a, b, c, d } = await cenario();
    const r = await request(app).get(`/api/publico/comparar?ids=${a},${b},${c},${d}`);
    expect(r.status).toBe(200);
    const [ua, ub, uc, ud] = r.body;
    expect(ua.iniciativas_validadas).toBe(3);
    expect(ua.por_categoria).toMatchObject({ politica_institucional: 1, projeto_extensao: 1, servico_permanente: 1, acao_pontual: 0 });
    expect(ua.politicas_formalizadas).toBe(1);
    expect(ua.documentos).toBe(1);
    expect(ub.situacao_pesquisa).toBe("concluida_sem_iniciativas");
    expect(uc.situacao_pesquisa).toBe("nao_pesquisada");
    expect(ud.situacao_pesquisa).toBe("inconclusiva");
    expect(ua).not.toHaveProperty("posicao");
    expect((await request(app).get(`/api/publico/comparar?ids=${a}`)).status).toBe(400);
  });

  it("produz a comparação temática com denominador", async () => {
    await cenario();
    const r = (await request(app).get("/api/publico/comparacao-tematica")).body;
    expect(r.denominador).toBe(2);
    expect(r.com_politica_formalizada.n).toBe(1);
    expect(r.com_projeto_extensao.n).toBe(1);
    expect(r.com_ambos).toMatchObject({ n: 1, percentual: 50 });
    expect(r.publicos.find((p: any) => p.publico === "estudantes").iniciativas).toBe(4);
  });
});
