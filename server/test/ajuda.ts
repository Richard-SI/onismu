import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { criarApp } from "../src/app.js";
import { pool } from "../src/db.js";
import { gerarHashSenha } from "../src/lib/senhas.js";

export const app = criarApp();
export const SENHA = "senha-de-teste-123";

const TABELAS = [
  "relatos_erro", "tarefas_atualizacao", "historico_alteracoes", "possiveis_duplicidades", "candidatos", "coleta_paginas",
  "coleta_execucoes", "evidencias", "fontes", "iniciativa_documentos", "documentos", "iniciativa_relacoes", "iniciativa_publicos",
  "iniciativa_categorias_secundarias", "iniciativas", "campi", "universidades", "sessoes", "usuarios",
];

export async function limparBanco() {
  await pool.query(`TRUNCATE ${TABELAS.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function criarUsuario(email = "pesquisadora@teste.br", papel: "admin" | "pesquisador" = "pesquisador") {
  const r = await pool.query("INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES ($1,$2,$3,$4) RETURNING id",
    [email, `Usuária ${papel}`, papel, await gerarHashSenha(SENHA)]);
  return r.rows[0].id as number;
}

/** Agente autenticado: mantém o cookie de sessão e envia o cabeçalho anti-CSRF. */
export async function entrar(email = "pesquisadora@teste.br", papel: "admin" | "pesquisador" = "pesquisador") {
  await criarUsuario(email, papel);
  const agente = request.agent(app);
  const r = await agente.post("/api/auth/login").set("x-onismu-requisicao", "1").send({ email, senha: SENHA });
  if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${JSON.stringify(r.body)}`);
  const h = { "x-onismu-requisicao": "1" };
  return {
    get: (url: string) => agente.get(url).set(h),
    post: (url: string, body?: object) => agente.post(url).set(h).send(body ?? {}),
    put: (url: string, body?: object) => agente.put(url).set(h).send(body ?? {}),
    delete: (url: string, body?: object) => agente.delete(url).set(h).send(body ?? {}),
  };
}

export async function criarUniversidade(d: Partial<{ nome: string; sigla: string; uf: string; regiao: string; cat: string; situacao: string; dominio: string; origem: string }> = {}) {
  const r = await pool.query(
    `INSERT INTO universidades (nome_oficial, sigla, categoria_administrativa, regiao, estado, situacao_pesquisa, dominio, origem_dados)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [d.nome ?? "Universidade Federal de Teste", d.sigla ?? "UFT", d.cat ?? "publica_federal", d.regiao ?? "Sul", d.uf ?? "RS",
      d.situacao ?? "nao_pesquisada", d.dominio ?? null, d.origem ?? "real"]);
  return r.rows[0].id as number;
}

export const evidencia = (n = 1) => ({
  url: `https://www.exemplo-teste.br/pagina-${n}`,
  titulo: "Página de teste",
  tipo_fonte: "site_institucional",
  trecho_evidencia: "Trecho de evidência utilizado nos testes automatizados do observatório.",
});

export const iniciativaBase = (universidade_id: number, extra: Record<string, unknown> = {}) => ({
  nome: "Serviço de Atendimento Psicológico",
  universidade_id,
  categoria_principal: "servico_permanente",
  grau_evidencia: 3,
  status_validacao: "validada",
  publicos: ["estudantes"],
  evidencias: [evidencia()],
  ...extra,
});

/** Servidor HTTP local que serve páginas fixas — usado para testar a coleta sem acessar a internet. */
export async function servidorDePaginas(paginas: Record<string, { status?: number; tipo?: string; corpo: string }>) {
  const srv = http.createServer((req, res) => {
    const p = paginas[req.url ?? "/"];
    if (!p) { res.writeHead(404); return res.end("não encontrado"); }
    res.writeHead(p.status ?? 200, { "Content-Type": p.tipo ?? "text/html; charset=utf-8" });
    res.end(p.corpo);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const porta = (srv.address() as AddressInfo).port;
  return { base: `http://127.0.0.1:${porta}`, fechar: () => new Promise<void>((r) => srv.close(() => r())) };
}
