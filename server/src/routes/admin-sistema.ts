import { Router } from "express";
import { z } from "zod";
import { exigirAutenticacao } from "../auth/sessao.js";
import { pool } from "../db.js";
import { SITUACOES_PESQUISA } from "../dominio.js";
import { assinc, ErroHttp } from "../lib/erros.js";
import { REGIOES, UFS } from "../lib/geografia.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { esquemaPaginacao, offsetDe, respostaPaginada } from "../lib/paginacao.js";
import { gerarHashSenha, validarForcaSenha } from "../lib/senhas.js";
import { exportarBaseCompleta } from "../services/exportacao.js";

export const rotasAdminSistema = Router();
const id = z.coerce.number().int().positive();

rotasAdminSistema.get("/resumo", assinc(async (_req, res) => {
  const r = (await pool.query(
    `SELECT (SELECT count(*) FROM candidatos WHERE status = 'pendente') AS candidatos_pendentes,
            (SELECT count(*) FROM coleta_execucoes WHERE status IN ('na_fila', 'em_andamento')) AS coletas_em_andamento,
            (SELECT count(*) FROM possiveis_duplicidades WHERE status = 'pendente') AS duplicidades_pendentes,
            (SELECT count(*) FROM relatos_erro WHERE status = 'novo') AS relatos_novos,
            (SELECT count(*) FROM iniciativas WHERE status_validacao = 'pendente') AS iniciativas_pendentes,
            (SELECT count(*) FROM universidades WHERE origem_dados = 'demonstrativo') AS universidades_demo`,
  )).rows[0];
  const situacoes = await pool.query("SELECT situacao_pesquisa, count(*) AS n FROM universidades WHERE origem_dados = 'real' GROUP BY 1");
  res.json({ ...r, situacoes: situacoes.rows });
}));

// ---------------------------------------------------------------------------- Histórico
rotasAdminSistema.get("/historico", assinc(async (req, res) => {
  const f = z.object({ entidade: z.string().regex(/^[a-z_]+$/).optional(), registro_id: z.coerce.number().int().optional() }).merge(esquemaPaginacao).parse(req.query);
  const cond: string[] = []; const p: unknown[] = [];
  if (f.entidade) { p.push(f.entidade); cond.push(`h.entidade = $${p.length}`); }
  if (f.registro_id) { p.push(f.registro_id); cond.push(`h.registro_id = $${p.length}`); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const [itens, total] = await Promise.all([
    pool.query(`SELECT h.*, u.nome AS responsavel FROM historico_alteracoes h LEFT JOIN usuarios u ON u.id = h.responsavel_id
                 ${where} ORDER BY h.alterado_em DESC, h.id DESC LIMIT ${f.por_pagina} OFFSET ${offsetDe(f)}`, p),
    pool.query<{ n: number }>(`SELECT count(*) AS n FROM historico_alteracoes h ${where}`, p),
  ]);
  res.json(respostaPaginada(itens.rows, total.rows[0].n, f));
}));

// ---------------------------------------------------------------------------- Exportação da base
rotasAdminSistema.get("/exportar/base-completa.xlsx", assinc(async (_req, res) => {
  const buf = await exportarBaseCompleta();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="onismu_base_completa_${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
}));

// ---------------------------------------------------------------------------- Tarefas de atualização
const esquemaTarefa = z.object({
  nome: z.string().trim().min(3).max(200),
  escopo: z.object({
    estados: z.array(z.string().refine((v) => v in UFS)).default([]),
    regioes: z.array(z.enum(REGIOES)).default([]),
    universidade_ids: z.array(z.number().int().positive()).default([]),
    somente_situacoes: z.array(z.enum(SITUACOES_PESQUISA)).default([]),
  }),
  periodicidade_dias: z.number().int().min(1).max(3650),
  limite_por_execucao: z.number().int().min(1).max(500).default(10),
  ativa: z.boolean().default(true),
});

rotasAdminSistema.get("/tarefas", assinc(async (_req, res) => {
  res.json({ itens: (await pool.query("SELECT * FROM tarefas_atualizacao ORDER BY id")).rows });
}));

rotasAdminSistema.post("/tarefas", exigirAutenticacao("admin"), assinc(async (req, res) => {
  const d = esquemaTarefa.parse(req.body);
  const r = await pool.query(
    `INSERT INTO tarefas_atualizacao (nome, escopo, periodicidade_dias, limite_por_execucao, ativa, proxima_execucao)
     VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`, [d.nome, d.escopo, d.periodicidade_dias, d.limite_por_execucao, d.ativa]);
  await registrarAlteracoes(pool, "tarefas_atualizacao", r.rows[0].id, null, r.rows[0], req.usuario!.id, "Criação de tarefa");
  res.status(201).json(r.rows[0]);
}));

rotasAdminSistema.put("/tarefas/:id", exigirAutenticacao("admin"), assinc(async (req, res) => {
  const tid = id.parse(req.params.id);
  const d = esquemaTarefa.parse(req.body);
  const antes = (await pool.query("SELECT * FROM tarefas_atualizacao WHERE id = $1", [tid])).rows[0];
  if (!antes) throw new ErroHttp(404, "Tarefa não encontrada.");
  const r = await pool.query(
    "UPDATE tarefas_atualizacao SET nome=$2, escopo=$3, periodicidade_dias=$4, limite_por_execucao=$5, ativa=$6 WHERE id = $1 RETURNING *",
    [tid, d.nome, d.escopo, d.periodicidade_dias, d.limite_por_execucao, d.ativa]);
  await registrarAlteracoes(pool, "tarefas_atualizacao", tid, antes, r.rows[0], req.usuario!.id, null);
  res.json(r.rows[0]);
}));

// ---------------------------------------------------------------------------- Relatos de erro
rotasAdminSistema.get("/relatos", assinc(async (_req, res) => {
  res.json({ itens: (await pool.query("SELECT * FROM relatos_erro ORDER BY created_at DESC LIMIT 500")).rows });
}));

rotasAdminSistema.post("/relatos/:id/status", assinc(async (req, res) => {
  const rid = id.parse(req.params.id);
  const d = z.object({ status: z.enum(["novo", "em_analise", "resolvido", "descartado"]) }).parse(req.body);
  const antes = (await pool.query("SELECT status FROM relatos_erro WHERE id = $1", [rid])).rows[0];
  if (!antes) throw new ErroHttp(404, "Relato não encontrado.");
  await pool.query("UPDATE relatos_erro SET status = $2 WHERE id = $1", [rid, d.status]);
  await registrarAlteracoes(pool, "relatos_erro", rid, antes, d, req.usuario!.id, null);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------- Usuários (somente admin)
rotasAdminSistema.get("/usuarios", exigirAutenticacao("admin"), assinc(async (_req, res) => {
  res.json({ itens: (await pool.query("SELECT id, email, nome, papel, ativo, ultimo_login, created_at FROM usuarios ORDER BY id")).rows });
}));

rotasAdminSistema.post("/usuarios", exigirAutenticacao("admin"), assinc(async (req, res) => {
  const d = z.object({ email: z.string().trim().toLowerCase().email(), nome: z.string().trim().min(2).max(200),
    papel: z.enum(["admin", "pesquisador"]), senha: z.string().max(200) }).parse(req.body);
  const fraca = validarForcaSenha(d.senha);
  if (fraca) throw new ErroHttp(400, fraca);
  const r = await pool.query("INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES ($1,$2,$3,$4) RETURNING id, email, nome, papel, ativo",
    [d.email, d.nome, d.papel, await gerarHashSenha(d.senha)]);
  await registrarAlteracoes(pool, "usuarios", r.rows[0].id, null, r.rows[0], req.usuario!.id, "Criação de usuário");
  res.status(201).json(r.rows[0]);
}));

rotasAdminSistema.post("/usuarios/:id/ativo", exigirAutenticacao("admin"), assinc(async (req, res) => {
  const uid = id.parse(req.params.id);
  const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);
  if (uid === req.usuario!.id && !ativo) throw new ErroHttp(400, "Você não pode desativar a própria conta.");
  await pool.query("UPDATE usuarios SET ativo = $2 WHERE id = $1", [uid, ativo]);
  if (!ativo) await pool.query("DELETE FROM sessoes WHERE usuario_id = $1", [uid]);
  await registrarAlteracoes(pool, "usuarios", uid, null, { ativo }, req.usuario!.id, null);
  res.json({ ok: true });
}));
