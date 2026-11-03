import { Router } from "express";
import { z } from "zod";
import { pool, transacao } from "../db.js";
import {
  CATEGORIAS_ADMINISTRATIVAS, esquemaEvidenciaEntrada, SITUACOES_PESQUISA, STATUS_VALIDACAO, TIPOS_DOCUMENTO, TIPOS_FONTE, TIPOS_RELACAO,
} from "../dominio.js";
import { assinc, ErroHttp } from "../lib/erros.js";
import { regiaoDaUf, UFS } from "../lib/geografia.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { normalizarUrl, validarUrlPublica } from "../lib/url.js";
import { listarUniversidades } from "../services/consultas-universidades.js";
import { obterOuCriarFonte } from "../services/fontes.js";
import {
  alterarStatus, atualizarIniciativa, criarIniciativa, detalharIniciativa, listarIniciativas, verificarRegrasDeValidacao,
} from "../services/iniciativas.js";
import { concluirPesquisa, mudarSituacao, recalcularSituacao } from "../services/universidades.js";
import { esquemaFiltrosIniciativas, esquemaFiltrosUniversidades } from "./filtros.js";

export const rotasAdminRegistros = Router();
const id = z.coerce.number().int().positive();
const justificativa = z.string().trim().max(1000).optional().nullable();

// ---------------------------------------------------------------------------- Universidades
const urlOpcional = z.string().trim().max(500).optional().nullable().transform((v) => v || null)
  .refine((v) => { if (!v) return true; try { validarUrlPublica(v); return true; } catch { return false; } }, "URL inválida.");

const esquemaUniversidade = z.object({
  nome_oficial: z.string().trim().min(5).max(300),
  sigla: z.string().trim().max(30).optional().nullable().transform((v) => v || null),
  codigo_institucional: z.number().int().positive().optional().nullable(),
  categoria_administrativa: z.enum(CATEGORIAS_ADMINISTRATIVAS),
  subcategoria: z.string().trim().max(100).optional().nullable(),
  estado: z.string().toUpperCase().refine((v) => v in UFS, "UF inválida"),
  municipio: z.string().trim().max(200).optional().nullable(),
  site_oficial: urlOpcional,
  dominio: z.string().trim().toLowerCase().max(200).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domínio inválido").optional().nullable().or(z.literal("").transform(() => null)),
  fonte_cadastro: z.string().trim().max(500).optional().nullable(),
  justificativa,
});

rotasAdminRegistros.get("/universidades", assinc(async (req, res) => {
  res.json(await listarUniversidades(esquemaFiltrosUniversidades.parse({ demo: "true", ...req.query })));
}));

rotasAdminRegistros.get("/universidades/:id", assinc(async (req, res) => {
  const uid = id.parse(req.params.id);
  const u = (await pool.query("SELECT * FROM universidades WHERE id = $1", [uid])).rows[0];
  if (!u) throw new ErroHttp(404, "Universidade não encontrada.");
  const [campi, execucoes, candidatos] = await Promise.all([
    pool.query("SELECT * FROM campi WHERE universidade_id = $1 ORDER BY nome", [uid]),
    pool.query("SELECT id, identificador, modo, status, iniciada_em, finalizada_em, paginas_examinadas, candidatos_encontrados FROM coleta_execucoes WHERE universidade_id = $1 ORDER BY iniciada_em DESC", [uid]),
    pool.query("SELECT status, count(*) AS n FROM candidatos WHERE universidade_id = $1 GROUP BY status", [uid]),
  ]);
  res.json({ ...u, campi: campi.rows, execucoes: execucoes.rows, candidatos_por_status: candidatos.rows });
}));

rotasAdminRegistros.post("/universidades", assinc(async (req, res) => {
  const d = esquemaUniversidade.parse(req.body);
  const novo = await transacao(async (c) => {
    const r = await c.query(
      `INSERT INTO universidades (nome_oficial, sigla, codigo_institucional, categoria_administrativa, subcategoria, regiao, estado, municipio, site_oficial, dominio, fonte_cadastro)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.nome_oficial, d.sigla, d.codigo_institucional ?? null, d.categoria_administrativa, d.subcategoria ?? null, regiaoDaUf(d.estado),
        d.estado, d.municipio ?? null, d.site_oficial, d.dominio ?? null, d.fonte_cadastro ?? "cadastro manual"],
    );
    await registrarAlteracoes(c, "universidades", r.rows[0].id, null, r.rows[0], req.usuario!.id, d.justificativa ?? "Cadastro manual");
    return r.rows[0];
  });
  res.status(201).json(novo);
}));

rotasAdminRegistros.put("/universidades/:id", assinc(async (req, res) => {
  const uid = id.parse(req.params.id);
  const d = esquemaUniversidade.parse(req.body);
  const r = await transacao(async (c) => {
    const antes = (await c.query("SELECT * FROM universidades WHERE id = $1 FOR UPDATE", [uid])).rows[0];
    if (!antes) throw new ErroHttp(404, "Universidade não encontrada.");
    const depois = (await c.query(
      `UPDATE universidades SET nome_oficial=$2, sigla=$3, codigo_institucional=$4, categoria_administrativa=$5, subcategoria=$6,
              regiao=$7, estado=$8, municipio=$9, site_oficial=$10, dominio=$11, fonte_cadastro=coalesce($12, fonte_cadastro)
        WHERE id = $1 RETURNING *`,
      [uid, d.nome_oficial, d.sigla, d.codigo_institucional ?? null, d.categoria_administrativa, d.subcategoria ?? null, regiaoDaUf(d.estado),
        d.estado, d.municipio ?? null, d.site_oficial, d.dominio ?? null, d.fonte_cadastro ?? null],
    )).rows[0];
    await registrarAlteracoes(c, "universidades", uid, antes, depois, req.usuario!.id, d.justificativa);
    return depois;
  });
  res.json(r);
}));

rotasAdminRegistros.post("/universidades/:id/situacao", assinc(async (req, res) => {
  const uid = id.parse(req.params.id);
  const d = z.object({
    acao: z.enum(["concluir", "inconclusiva", "reabrir", "definir"]),
    situacao: z.enum(SITUACOES_PESQUISA).optional(),
    justificativa: z.string().trim().min(5).max(1000),
  }).parse(req.body);
  const nova = await transacao(async (c) => {
    if (d.acao === "concluir") return concluirPesquisa(c, uid, "concluida", req.usuario!.id, d.justificativa);
    if (d.acao === "inconclusiva") return concluirPesquisa(c, uid, "inconclusiva", req.usuario!.id, d.justificativa);
    if (d.acao === "reabrir") { await mudarSituacao(c, uid, "em_pesquisa", req.usuario!.id, d.justificativa); return "em_pesquisa"; }
    // Definição manual não permite marcar como concluída (use "concluir", que verifica as fontes consultadas).
    if (!d.situacao || d.situacao.startsWith("concluida")) throw new ErroHttp(400, "Use a ação 'concluir' para encerrar a pesquisa.");
    await mudarSituacao(c, uid, d.situacao, req.usuario!.id, d.justificativa);
    return d.situacao;
  });
  res.json({ situacao_pesquisa: nova });
}));

rotasAdminRegistros.post("/universidades/:id/campi", assinc(async (req, res) => {
  const uid = id.parse(req.params.id);
  const d = z.object({ nome: z.string().trim().min(2).max(200), municipio: z.string().trim().max(200).optional().nullable(),
    estado: z.string().toUpperCase().refine((v) => v in UFS).optional().nullable(), descricao: z.string().max(2000).optional().nullable() }).parse(req.body);
  const r = await pool.query("INSERT INTO campi (universidade_id, nome, municipio, estado, descricao) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [uid, d.nome, d.municipio ?? null, d.estado ?? null, d.descricao ?? null]);
  await registrarAlteracoes(pool, "campi", r.rows[0].id, null, r.rows[0], req.usuario!.id, "Cadastro de campus");
  res.status(201).json(r.rows[0]);
}));

// ---------------------------------------------------------------------------- Iniciativas
rotasAdminRegistros.get("/iniciativas", assinc(async (req, res) => {
  const f = esquemaFiltrosIniciativas.parse({ demo: "true", ...req.query });
  res.json(await listarIniciativas(f, f, false));
}));

rotasAdminRegistros.get("/iniciativas/:id", assinc(async (req, res) => {
  const iid = id.parse(req.params.id);
  const [det, hist, dups] = await Promise.all([
    detalharIniciativa(iid, false),
    pool.query(`SELECT h.*, u.nome AS responsavel FROM historico_alteracoes h LEFT JOIN usuarios u ON u.id = h.responsavel_id
                 WHERE h.entidade = 'iniciativas' AND h.registro_id = $1 ORDER BY h.alterado_em DESC LIMIT 200`, [iid]),
    pool.query(`SELECT d.*, CASE WHEN d.iniciativa_a = $1 THEN d.iniciativa_b ELSE d.iniciativa_a END AS outra_id,
                       o.nome AS outra_nome FROM possiveis_duplicidades d
                  JOIN iniciativas o ON o.id = CASE WHEN d.iniciativa_a = $1 THEN d.iniciativa_b ELSE d.iniciativa_a END
                 WHERE d.iniciativa_a = $1 OR d.iniciativa_b = $1`, [iid]),
  ]);
  const extra = (await pool.query("SELECT universidade_id, campus_id FROM iniciativas WHERE id = $1", [iid])).rows[0];
  res.json({ ...det, ...extra, historico: hist.rows, possiveis_duplicidades: dups.rows });
}));

rotasAdminRegistros.post("/iniciativas", assinc(async (req, res) => {
  const novoId = await transacao((c) => criarIniciativa(c, req.body, req.usuario!.id));
  res.status(201).json({ id: novoId });
}));

rotasAdminRegistros.put("/iniciativas/:id", assinc(async (req, res) => {
  const iid = id.parse(req.params.id);
  await transacao((c) => atualizarIniciativa(c, iid, req.body, req.usuario!.id));
  res.json({ id: iid });
}));

rotasAdminRegistros.post("/iniciativas/:id/status", assinc(async (req, res) => {
  const iid = id.parse(req.params.id);
  const d = z.object({ status: z.enum(STATUS_VALIDACAO), justificativa: z.string().trim().min(3).max(1000) }).parse(req.body);
  await transacao((c) => alterarStatus(c, iid, d.status, req.usuario!.id, d.justificativa));
  res.json({ id: iid, status_validacao: d.status });
}));

rotasAdminRegistros.post("/iniciativas/:id/evidencias", assinc(async (req, res) => {
  const iid = id.parse(req.params.id);
  const ev = esquemaEvidenciaEntrada.parse(req.body);
  await transacao(async (c) => {
    const ini = (await c.query("SELECT universidade_id FROM iniciativas WHERE id = $1", [iid])).rows[0];
    if (!ini) throw new ErroHttp(404, "Iniciativa não encontrada.");
    const fonteId = await obterOuCriarFonte(c, { url: ev.url, titulo: ev.titulo, tipo_fonte: ev.tipo_fonte, data_consulta: ev.data_consulta ?? new Date(), data_publicacao: ev.data_publicacao, universidade_id: ini.universidade_id });
    await c.query("INSERT INTO evidencias (iniciativa_id, fonte_id, trecho_evidencia, data_consulta, criado_por) VALUES ($1,$2,$3,$4,$5)",
      [iid, fonteId, ev.trecho_evidencia, ev.data_consulta ?? new Date(), req.usuario!.id]);
    await registrarAlteracoes(c, "iniciativas", iid, null, { evidencia_adicionada: `fonte #${fonteId}` }, req.usuario!.id, "Evidência adicionada");
  });
  res.status(201).json({ ok: true });
}));

rotasAdminRegistros.delete("/iniciativas/:id/evidencias/:evid", assinc(async (req, res) => {
  const iid = id.parse(req.params.id);
  const eid = id.parse(req.params.evid);
  const motivo = z.object({ justificativa: z.string().trim().min(3) }).parse(req.body);
  await transacao(async (c) => {
    const ev = (await c.query("DELETE FROM evidencias WHERE id = $1 AND iniciativa_id = $2 RETURNING *", [eid, iid])).rows[0];
    if (!ev) throw new ErroHttp(404, "Evidência não encontrada.");
    const st = (await c.query("SELECT status_validacao FROM iniciativas WHERE id = $1", [iid])).rows[0];
    if (st.status_validacao === "validada") await verificarRegrasDeValidacao(c, iid);
    await registrarAlteracoes(c, "iniciativas", iid, { evidencia_removida: `#${eid} (fonte #${ev.fonte_id}): ${ev.trecho_evidencia}` }, { evidencia_removida: null }, req.usuario!.id, motivo.justificativa);
  });
  res.json({ ok: true });
}));

rotasAdminRegistros.post("/iniciativas/:id/relacoes", assinc(async (req, res) => {
  const iid = id.parse(req.params.id);
  const d = z.object({ destino_id: z.number().int().positive(), tipo: z.enum(TIPOS_RELACAO), observacao: z.string().max(1000).optional().nullable() }).parse(req.body);
  if (d.destino_id === iid) throw new ErroHttp(400, "Uma iniciativa não pode se relacionar consigo mesma.");
  if (d.tipo === "vinculada_a_politica") {
    const destino = (await pool.query("SELECT c.codigo FROM iniciativas i JOIN categorias c ON c.id = i.categoria_principal_id WHERE i.id = $1", [d.destino_id])).rows[0];
    if (destino?.codigo !== "politica_institucional") throw new ErroHttp(400, "O destino de 'vinculada_a_politica' deve ser uma política institucional.");
  }
  const r = await pool.query("INSERT INTO iniciativa_relacoes (origem_id, destino_id, tipo, observacao) VALUES ($1,$2,$3,$4) RETURNING *",
    [iid, d.destino_id, d.tipo, d.observacao ?? null]);
  await registrarAlteracoes(pool, "iniciativas", iid, null, { relacao: `${d.tipo} → #${d.destino_id}` }, req.usuario!.id, d.observacao);
  res.status(201).json(r.rows[0]);
}));

rotasAdminRegistros.delete("/relacoes/:id", assinc(async (req, res) => {
  const r = (await pool.query("DELETE FROM iniciativa_relacoes WHERE id = $1 RETURNING *", [id.parse(req.params.id)])).rows[0];
  if (!r) throw new ErroHttp(404, "Relação não encontrada.");
  await registrarAlteracoes(pool, "iniciativas", r.origem_id, { relacao: `${r.tipo} → #${r.destino_id}` }, { relacao: null }, req.usuario!.id, "Relação removida");
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------- Documentos e fontes
const esquemaDocumento = z.object({
  titulo: z.string().trim().min(3).max(500),
  tipo_documento: z.enum(TIPOS_DOCUMENTO),
  numero_documento: z.string().trim().max(100).optional().nullable(),
  data_publicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  orgao_emissor: z.string().trim().max(300).optional().nullable(),
  url_original: urlOpcional,
  descricao: z.string().max(4000).optional().nullable(),
  universidade_id: z.number().int().positive(),
  justificativa,
});

rotasAdminRegistros.get("/documentos", assinc(async (req, res) => {
  const q = z.object({ universidade_id: z.coerce.number().int().positive().optional() }).parse(req.query);
  const r = await pool.query(
    `SELECT d.*, u.sigla, (SELECT count(*) FROM iniciativa_documentos x WHERE x.documento_id = d.id) AS n_iniciativas
       FROM documentos d JOIN universidades u ON u.id = d.universidade_id
      ${q.universidade_id ? "WHERE d.universidade_id = $1" : ""} ORDER BY d.created_at DESC LIMIT 500`,
    q.universidade_id ? [q.universidade_id] : []);
  res.json({ itens: r.rows });
}));

rotasAdminRegistros.post("/documentos", assinc(async (req, res) => {
  const d = esquemaDocumento.parse(req.body);
  const r = await transacao(async (c) => {
    const novo = (await c.query(
      `INSERT INTO documentos (titulo, tipo_documento, numero_documento, data_publicacao, orgao_emissor, url_original, url_normalizada, descricao, universidade_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.titulo, d.tipo_documento, d.numero_documento ?? null, d.data_publicacao ?? null, d.orgao_emissor ?? null, d.url_original,
        d.url_original ? normalizarUrl(d.url_original) : null, d.descricao ?? null, d.universidade_id])).rows[0];
    await registrarAlteracoes(c, "documentos", novo.id, null, novo, req.usuario!.id, d.justificativa ?? "Cadastro de documento");
    return novo;
  });
  res.status(201).json(r);
}));

rotasAdminRegistros.put("/documentos/:id", assinc(async (req, res) => {
  const did = id.parse(req.params.id);
  const d = esquemaDocumento.parse(req.body);
  const r = await transacao(async (c) => {
    const antes = (await c.query("SELECT * FROM documentos WHERE id = $1 FOR UPDATE", [did])).rows[0];
    if (!antes) throw new ErroHttp(404, "Documento não encontrado.");
    const depois = (await c.query(
      `UPDATE documentos SET titulo=$2, tipo_documento=$3, numero_documento=$4, data_publicacao=$5, orgao_emissor=$6, url_original=$7,
              url_normalizada=$8, descricao=$9, universidade_id=$10 WHERE id = $1 RETURNING *`,
      [did, d.titulo, d.tipo_documento, d.numero_documento ?? null, d.data_publicacao ?? null, d.orgao_emissor ?? null, d.url_original,
        d.url_original ? normalizarUrl(d.url_original) : null, d.descricao ?? null, d.universidade_id])).rows[0];
    await registrarAlteracoes(c, "documentos", did, antes, depois, req.usuario!.id, d.justificativa);
    return depois;
  });
  res.json(r);
}));

rotasAdminRegistros.get("/fontes", assinc(async (req, res) => {
  const q = z.object({ universidade_id: z.coerce.number().int().positive().optional() }).parse(req.query);
  const r = await pool.query(
    `SELECT f.*, u.sigla, (SELECT count(*) FROM evidencias e WHERE e.fonte_id = f.id) AS n_evidencias
       FROM fontes f LEFT JOIN universidades u ON u.id = f.universidade_id
      ${q.universidade_id ? "WHERE f.universidade_id = $1" : ""} ORDER BY f.data_consulta DESC LIMIT 500`,
    q.universidade_id ? [q.universidade_id] : []);
  res.json({ itens: r.rows });
}));

rotasAdminRegistros.put("/fontes/:id", assinc(async (req, res) => {
  const fid = id.parse(req.params.id);
  const d = z.object({
    titulo: z.string().trim().max(500).optional().nullable(), tipo_fonte: z.enum(TIPOS_FONTE),
    situacao_fonte: z.enum(["acessivel", "indisponivel", "alterada", "nao_verificada"]),
    data_publicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), observacoes: z.string().max(2000).optional().nullable(), justificativa,
  }).parse(req.body);
  const r = await transacao(async (c) => {
    const antes = (await c.query("SELECT * FROM fontes WHERE id = $1 FOR UPDATE", [fid])).rows[0];
    if (!antes) throw new ErroHttp(404, "Fonte não encontrada.");
    const depois = (await c.query(
      "UPDATE fontes SET titulo=$2, tipo_fonte=$3, situacao_fonte=$4, data_publicacao=$5, observacoes=$6 WHERE id = $1 RETURNING *",
      [fid, d.titulo ?? null, d.tipo_fonte, d.situacao_fonte, d.data_publicacao ?? null, d.observacoes ?? null])).rows[0];
    await registrarAlteracoes(c, "fontes", fid, antes, depois, req.usuario!.id, d.justificativa);
    return depois;
  });
  res.json(r);
}));

rotasAdminRegistros.post("/universidades/:id/recalcular", assinc(async (req, res) => {
  const uid = id.parse(req.params.id);
  await transacao((c) => recalcularSituacao(c, uid, req.usuario!.id));
  res.json({ ok: true });
}));
