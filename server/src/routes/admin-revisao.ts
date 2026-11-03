import { Router } from "express";
import { z } from "zod";
import { pool, transacao } from "../db.js";
import { STATUS_CANDIDATO } from "../dominio.js";
import { statusBusca, testarBusca } from "../coleta/busca.js";
import { statusOllama } from "../coleta/extrator-ollama.js";
import { coletasNaFila, criarExecucao, enfileirarColeta } from "../coleta/fila.js";
import { verificarTrechoCandidato } from "../coleta/verificar-trecho.js";
import { config } from "../config.js";
import { assinc, ErroHttp } from "../lib/erros.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { esquemaPaginacao, listaQuery, offsetDe, respostaPaginada } from "../lib/paginacao.js";
import {
  aprovarCandidato, marcarInconclusivo, rejeitarCandidato, solicitarRecoleta, sugerirDuplicatas, vincularCandidato,
} from "../services/candidatos.js";

export const rotasAdminRevisao = Router();
const id = z.coerce.number().int().positive();

// ---------------------------------------------------------------------------- Fila de revisão
rotasAdminRevisao.get("/candidatos", assinc(async (req, res) => {
  const f = z.object({
    status: listaQuery(z.enum(STATUS_CANDIDATO)),
    universidade_id: listaQuery(z.coerce.number().int().positive()),
    execucao_id: z.coerce.number().int().positive().optional(),
    verificacao: listaQuery(z.enum(["confirmado", "nao_localizado", "nao_verificado", "erro_acesso"])),
    q: z.string().trim().max(200).optional(),
  }).merge(esquemaPaginacao).parse(req.query);
  const cond: string[] = [];
  const p: unknown[] = [];
  const add = (sql: (n: string) => string, v: unknown) => { p.push(v); cond.push(sql(`$${p.length}`)); };
  add((n) => `c.status = ANY(${n})`, f.status.length ? f.status : ["pendente"]);
  if (f.universidade_id.length) add((n) => `c.universidade_id = ANY(${n})`, f.universidade_id);
  if (f.execucao_id) add((n) => `c.execucao_id = ${n}`, f.execucao_id);
  if (f.verificacao.length) add((n) => `c.verificacao_trecho = ANY(${n})`, f.verificacao);
  if (f.q) add((n) => `f_normalizar(c.nome || ' ' || u.nome_oficial || ' ' || coalesce(u.sigla,'')) LIKE f_normalizar(${n})`, `%${f.q}%`);
  const where = `WHERE ${cond.join(" AND ")}`;
  const [itens, total] = await Promise.all([
    pool.query(
      `SELECT c.id, c.nome, c.categoria_sugerida, c.grau_evidencia_sugerido, c.confianca, c.status, c.extrator, c.url_fonte,
              c.titulo_fonte, c.tipo_fonte, c.trecho_evidencia, c.dados->>'descricao' AS descricao, c.justificativa,
              c.verificacao_trecho, c.verificacao_detalhe, c.possiveis_duplicatas, c.motivo_decisao,
              jsonb_array_length(c.possiveis_duplicatas) AS n_duplicatas, c.created_at,
              u.id AS universidade_id, u.sigla AS universidade_sigla, u.nome_oficial AS universidade_nome, u.estado,
              e.identificador AS execucao
         FROM candidatos c JOIN universidades u ON u.id = c.universidade_id JOIN coleta_execucoes e ON e.id = c.execucao_id
        ${where} ORDER BY u.estado, u.sigla, c.id LIMIT ${f.por_pagina} OFFSET ${offsetDe(f)}`, p),
    pool.query<{ n: number }>(`SELECT count(*) AS n FROM candidatos c JOIN universidades u ON u.id = c.universidade_id ${where}`, p),
  ]);
  res.json(respostaPaginada(itens.rows, total.rows[0].n, f));
}));

rotasAdminRevisao.get("/candidatos/:id", assinc(async (req, res) => {
  const cid = id.parse(req.params.id);
  const c = (await pool.query(
    `SELECT c.*, u.nome_oficial AS universidade_nome, u.sigla AS universidade_sigla, u.dominio,
            e.identificador AS execucao_identificador, e.modo, e.ferramenta, e.iniciada_em, e.finalizada_em, e.status AS execucao_status,
            e.termos_busca, e.erros AS execucao_erros, e.pendencias AS execucao_pendencias,
            p.url AS pagina_url, p.status AS pagina_status, p.consultada_em, p.observacao AS pagina_observacao, p.consulta,
            dec.nome AS decidido_por_nome, i.nome AS iniciativa_nome
       FROM candidatos c JOIN universidades u ON u.id = c.universidade_id JOIN coleta_execucoes e ON e.id = c.execucao_id
       LEFT JOIN coleta_paginas p ON p.id = c.pagina_id LEFT JOIN usuarios dec ON dec.id = c.decidido_por
       LEFT JOIN iniciativas i ON i.id = c.iniciativa_id
      WHERE c.id = $1`, [cid])).rows[0];
  if (!c) throw new ErroHttp(404, "Candidato não encontrado.");
  // Duplicidades recalculadas no momento da revisão (a base pode ter mudado desde a coleta).
  const duplicatas = await sugerirDuplicatas(pool, c.universidade_id, c.nome, c.url_fonte, c.id);
  res.json({ ...c, possiveis_duplicatas_atuais: duplicatas });
}));

const motivo = z.object({ motivo: z.string().trim().max(2000).optional().default("") });

rotasAdminRevisao.post("/candidatos/:id/aprovar", assinc(async (req, res) => {
  const cid = id.parse(req.params.id);
  const d = z.object({ edicoes: z.record(z.string(), z.unknown()).optional().default({}), justificativa: z.string().trim().max(1000).optional() }).parse(req.body);
  const iniciativaId = await transacao((c) => aprovarCandidato(c, cid, req.usuario!.id, d.edicoes, d.justificativa));
  res.json({ iniciativa_id: iniciativaId });
}));

rotasAdminRevisao.post("/candidatos/:id/rejeitar", assinc(async (req, res) => {
  const cid = id.parse(req.params.id);
  await transacao((c) => rejeitarCandidato(c, cid, req.usuario!.id, motivo.parse(req.body).motivo));
  res.json({ ok: true });
}));

rotasAdminRevisao.post("/candidatos/:id/inconclusivo", assinc(async (req, res) => {
  const cid = id.parse(req.params.id);
  await transacao((c) => marcarInconclusivo(c, cid, req.usuario!.id, motivo.parse(req.body).motivo));
  res.json({ ok: true });
}));

rotasAdminRevisao.post("/candidatos/:id/recoleta", assinc(async (req, res) => {
  const cid = id.parse(req.params.id);
  await transacao((c) => solicitarRecoleta(c, cid, req.usuario!.id, motivo.parse(req.body).motivo));
  res.json({ ok: true });
}));

rotasAdminRevisao.post("/candidatos/:id/vincular", assinc(async (req, res) => {
  const cid = id.parse(req.params.id);
  const d = z.object({ iniciativa_id: z.number().int().positive(), motivo: z.string().trim().max(1000).optional() }).parse(req.body);
  await transacao((c) => vincularCandidato(c, cid, d.iniciativa_id, req.usuario!.id, d.motivo));
  res.json({ ok: true });
}));

rotasAdminRevisao.post("/candidatos/:id/verificar-trecho", assinc(async (req, res) => {
  res.json(await verificarTrechoCandidato(id.parse(req.params.id)));
}));

/** Resumo para a aba de validação: universidades com candidatos e contagem por decisão. */
rotasAdminRevisao.get("/validacao/universidades", assinc(async (_req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.sigla, u.nome_oficial, u.estado, u.situacao_pesquisa,
            count(*) FILTER (WHERE c.status = 'pendente') AS pendentes,
            count(*) FILTER (WHERE c.status IN ('aprovado', 'vinculado')) AS aprovados,
            count(*) FILTER (WHERE c.status = 'rejeitado') AS rejeitados,
            count(*) FILTER (WHERE c.status IN ('inconclusivo', 'recoleta_solicitada')) AS outros,
            (SELECT count(*) FROM iniciativas i WHERE i.universidade_id = u.id AND i.status_validacao = 'validada') AS iniciativas_validadas
       FROM candidatos c JOIN universidades u ON u.id = c.universidade_id
      GROUP BY u.id ORDER BY count(*) FILTER (WHERE c.status = 'pendente') DESC, u.sigla`,
  );
  res.json({ itens: r.rows });
}));

// ---------------------------------------------------------------------------- Coleta
rotasAdminRevisao.get("/coleta/status", assinc(async (req, res) => {
  const busca = statusBusca();
  const teste = req.query.testar === "1" && busca.disponivel ? await testarBusca() : null;
  let extrator: Record<string, unknown>;
  if (config.EXTRATOR === "ollama") {
    const st = await statusOllama();
    extrator = { configurado: "ollama", ia_disponivel: st.disponivel, modelo: config.OLLAMA_MODELO, observacao: st.motivo ?? "Modelo local (sem custo por uso)." };
  } else if (config.EXTRATOR === "claude") {
    extrator = { configurado: "claude", ia_disponivel: Boolean(config.ANTHROPIC_API_KEY), modelo: config.CLAUDE_MODELO,
      observacao: config.ANTHROPIC_API_KEY ? "Use `npm run diagnosticar:coleta -w server` para confirmar créditos." : "Sem ANTHROPIC_API_KEY: o SDK tentará um perfil `ant auth login`; se não houver, a coleta falhará com erro registrado." };
  } else {
    extrator = { configurado: "heuristico", ia_disponivel: false, modelo: null, observacao: "Extrator determinístico (sem IA) ativo." };
  }
  res.json({
    busca: { ...busca, teste },
    extrator,
    limites: { paginas: config.COLETA_MAX_PAGINAS, bytes: config.COLETA_MAX_BYTES, timeout_ms: config.COLETA_TIMEOUT_MS, intervalo_host_ms: config.COLETA_INTERVALO_HOST_MS },
    na_fila: coletasNaFila(),
  });
}));

rotasAdminRevisao.post("/coleta/execucoes", assinc(async (req, res) => {
  const d = z.object({
    universidade_ids: z.array(z.number().int().positive()).min(1).max(50),
    modo: z.enum(["busca_api", "urls_manuais"]),
    urls: z.array(z.string()).max(50).optional(),
    observacoes: z.string().max(2000).optional().nullable(),
  }).parse(req.body);
  if (d.modo === "busca_api" && !statusBusca().disponivel) throw new ErroHttp(422, statusBusca().motivo!);
  if (d.modo === "urls_manuais" && d.universidade_ids.length !== 1) throw new ErroHttp(400, "URLs informadas valem para uma universidade por vez.");
  const criadas = [];
  for (const uid of d.universidade_ids) {
    const e = await criarExecucao({ universidade_id: uid, modo: d.modo, urls: d.urls, observacoes: d.observacoes }, req.usuario!.id);
    void enfileirarColeta(e.id);
    criadas.push(e);
  }
  res.status(202).json({ execucoes: criadas });
}));

rotasAdminRevisao.get("/coleta/execucoes", assinc(async (req, res) => {
  const f = z.object({ universidade_id: z.coerce.number().int().positive().optional(), status: listaQuery(z.string()) }).merge(esquemaPaginacao).parse(req.query);
  const cond: string[] = []; const p: unknown[] = [];
  if (f.universidade_id) { p.push(f.universidade_id); cond.push(`e.universidade_id = $${p.length}`); }
  if (f.status.length) { p.push(f.status); cond.push(`e.status = ANY($${p.length})`); }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const [itens, total] = await Promise.all([
    pool.query(
      `SELECT e.id, e.identificador, e.modo, e.ferramenta, e.status, e.iniciada_em, e.finalizada_em, e.paginas_examinadas,
              e.candidatos_encontrados, jsonb_array_length(e.erros) AS n_erros, cardinality(e.pendencias) AS n_pendencias,
              u.id AS universidade_id, u.sigla, u.nome_oficial, us.nome AS iniciada_por_nome,
              (SELECT count(*) FROM candidatos c WHERE c.execucao_id = e.id AND c.status IN ('aprovado', 'vinculado')) AS registros_aprovados
         FROM coleta_execucoes e JOIN universidades u ON u.id = e.universidade_id LEFT JOIN usuarios us ON us.id = e.iniciada_por
        ${where} ORDER BY e.iniciada_em DESC LIMIT ${f.por_pagina} OFFSET ${offsetDe(f)}`, p),
    pool.query<{ n: number }>(`SELECT count(*) AS n FROM coleta_execucoes e ${where}`, p),
  ]);
  res.json(respostaPaginada(itens.rows, total.rows[0].n, f));
}));

rotasAdminRevisao.get("/coleta/execucoes/:id", assinc(async (req, res) => {
  const eid = id.parse(req.params.id);
  const e = (await pool.query(
    `SELECT e.*, u.sigla, u.nome_oficial, us.nome AS iniciada_por_nome,
            (SELECT coalesce(json_agg(DISTINCT d.nome), '[]') FROM candidatos c JOIN usuarios d ON d.id = c.decidido_por WHERE c.execucao_id = e.id) AS responsaveis_validacao,
            (SELECT count(*) FROM candidatos c WHERE c.execucao_id = e.id AND c.status IN ('aprovado', 'vinculado')) AS registros_aprovados
       FROM coleta_execucoes e JOIN universidades u ON u.id = e.universidade_id LEFT JOIN usuarios us ON us.id = e.iniciada_por
      WHERE e.id = $1`, [eid])).rows[0];
  if (!e) throw new ErroHttp(404, "Execução não encontrada.");
  const [paginas, candidatos] = await Promise.all([
    pool.query("SELECT * FROM coleta_paginas WHERE execucao_id = $1 ORDER BY id", [eid]),
    pool.query("SELECT id, nome, categoria_sugerida, status, confianca, verificacao_trecho FROM candidatos WHERE execucao_id = $1 ORDER BY id", [eid]),
  ]);
  res.json({ ...e, paginas: paginas.rows, candidatos: candidatos.rows });
}));

// ---------------------------------------------------------------------------- Duplicidades
rotasAdminRevisao.get("/duplicidades", assinc(async (req, res) => {
  const f = z.object({ status: z.enum(["pendente", "confirmada", "descartada"]).default("pendente") }).parse(req.query);
  const r = await pool.query(
    `SELECT d.*, a.nome AS nome_a, a.status_validacao AS status_a, b.nome AS nome_b, b.status_validacao AS status_b,
            u.sigla, u.nome_oficial
       FROM possiveis_duplicidades d JOIN iniciativas a ON a.id = d.iniciativa_a JOIN iniciativas b ON b.id = d.iniciativa_b
       JOIN universidades u ON u.id = a.universidade_id
      WHERE d.status = $1 ORDER BY d.similaridade DESC, d.id LIMIT 500`, [f.status]);
  res.json({ itens: r.rows });
}));

/**
 * Resolve um par: "descartar" (não são duplicatas) ou "confirmar" (mantém uma iniciativa, transfere
 * evidências/documentos/públicos e arquiva a outra com relação 'duplicata_de'). Nada é excluído.
 */
rotasAdminRevisao.post("/duplicidades/:id/resolver", assinc(async (req, res) => {
  const did = id.parse(req.params.id);
  const d = z.object({ acao: z.enum(["confirmar", "descartar"]), manter_id: z.number().int().positive().optional(), justificativa: z.string().trim().min(3).max(1000) }).parse(req.body);
  await transacao(async (c) => {
    const par = (await c.query("SELECT * FROM possiveis_duplicidades WHERE id = $1 FOR UPDATE", [did])).rows[0];
    if (!par) throw new ErroHttp(404, "Par não encontrado.");
    if (par.status !== "pendente") throw new ErroHttp(409, "Este par já foi revisado.");
    if (d.acao === "confirmar") {
      if (!d.manter_id || ![par.iniciativa_a, par.iniciativa_b].includes(d.manter_id)) throw new ErroHttp(400, "Indique qual iniciativa manter.");
      const arquivar = d.manter_id === par.iniciativa_a ? par.iniciativa_b : par.iniciativa_a;
      await c.query(
        `INSERT INTO evidencias (iniciativa_id, fonte_id, trecho_evidencia, data_consulta, criado_por, verificacao_trecho)
         SELECT $1, fonte_id, trecho_evidencia, data_consulta, $3, verificacao_trecho FROM evidencias WHERE iniciativa_id = $2
         ON CONFLICT DO NOTHING`, [d.manter_id, arquivar, req.usuario!.id]);
      await c.query("INSERT INTO iniciativa_documentos SELECT $1, documento_id FROM iniciativa_documentos WHERE iniciativa_id = $2 ON CONFLICT DO NOTHING", [d.manter_id, arquivar]);
      await c.query("INSERT INTO iniciativa_publicos SELECT $1, publico_alvo_id FROM iniciativa_publicos WHERE iniciativa_id = $2 ON CONFLICT DO NOTHING", [d.manter_id, arquivar]);
      const antes = (await c.query("SELECT status_validacao FROM iniciativas WHERE id = $1", [arquivar])).rows[0];
      await c.query("UPDATE iniciativas SET status_validacao = 'arquivada' WHERE id = $1", [arquivar]);
      await c.query("INSERT INTO iniciativa_relacoes (origem_id, destino_id, tipo, observacao) VALUES ($1,$2,'duplicata_de',$3) ON CONFLICT DO NOTHING",
        [arquivar, d.manter_id, d.justificativa]);
      await registrarAlteracoes(c, "iniciativas", arquivar, antes, { status_validacao: "arquivada" }, req.usuario!.id, `Duplicata de #${d.manter_id}: ${d.justificativa}`);
    }
    await c.query("UPDATE possiveis_duplicidades SET status = $2, revisado_por = $3, revisado_em = now() WHERE id = $1",
      [did, d.acao === "confirmar" ? "confirmada" : "descartada", req.usuario!.id]);
  });
  res.json({ ok: true });
}));
