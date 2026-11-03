import type { Executor } from "../db.js";
import { pool } from "../db.js";
import {
  esquemaIniciativaEntrada, MESES_ATUALIDADE, TIPOS_DOCUMENTO_NORMATIVO,
  type IniciativaEntrada,
} from "../dominio.js";
import { ErroHttp } from "../lib/erros.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { Filtros, offsetDe, respostaPaginada, type Paginacao } from "../lib/paginacao.js";
import { gerarSlug } from "../lib/texto.js";
import { obterOuCriarFonte } from "./fontes.js";
import { recalcularSituacao } from "./universidades.js";

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

async function idsCategorias(ex: Executor, codigos: string[]): Promise<Map<string, number>> {
  if (!codigos.length) return new Map();
  const r = await ex.query<{ id: number; codigo: string }>(
    "SELECT id, codigo FROM categorias WHERE codigo = ANY($1) AND ativa",
    [codigos],
  );
  const m = new Map(r.rows.map((x) => [x.codigo, x.id]));
  const faltando = codigos.filter((c) => !m.has(c));
  if (faltando.length) throw new ErroHttp(400, `Categoria inválida ou inativa: ${faltando.join(", ")}.`);
  return m;
}

async function idsPublicos(ex: Executor, codigos: string[]): Promise<number[]> {
  if (!codigos.length) return [];
  const r = await ex.query<{ id: number; codigo: string }>("SELECT id, codigo FROM publicos_alvo WHERE codigo = ANY($1)", [codigos]);
  const faltando = codigos.filter((c) => !r.rows.some((x) => x.codigo === c));
  if (faltando.length) throw new ErroHttp(400, `Público-alvo inválido: ${faltando.join(", ")}.`);
  return r.rows.map((x) => x.id);
}

/**
 * Regras para que uma iniciativa possa constar como validada no catálogo público:
 * - ao menos uma evidência (trecho + fonte);
 * - Nível 1 (política formalizada) exige documento normativo vinculado.
 */
export async function verificarRegrasDeValidacao(ex: Executor, id: number) {
  const r = await ex.query<{ grau: number; n_evid: number; n_norm: number }>(
    `SELECT i.grau_evidencia AS grau,
            (SELECT count(*) FROM evidencias e WHERE e.iniciativa_id = i.id) AS n_evid,
            (SELECT count(*) FROM iniciativa_documentos d JOIN documentos doc ON doc.id = d.documento_id
              WHERE d.iniciativa_id = i.id AND doc.tipo_documento = ANY($2)) AS n_norm
       FROM iniciativas i WHERE i.id = $1`,
    [id, TIPOS_DOCUMENTO_NORMATIVO],
  );
  const x = r.rows[0];
  if (!x) throw new ErroHttp(404, "Iniciativa não encontrada.");
  if (x.n_evid === 0) throw new ErroHttp(422, "Uma iniciativa validada precisa de ao menos uma evidência (fonte e trecho).");
  if (x.grau === 1 && x.n_norm === 0)
    throw new ErroHttp(422, "O Nível 1 (política formalizada) exige um documento normativo vinculado.");
}

async function slugUnico(ex: Executor, nome: string, sigla: string | null): Promise<string> {
  const base = gerarSlug(`${sigla ?? ""} ${nome}`);
  let slug = base;
  for (let i = 2; ; i++) {
    const r = await ex.query("SELECT 1 FROM iniciativas WHERE slug = $1", [slug]);
    if (!r.rowCount) return slug;
    slug = `${base}-${i}`;
  }
}

async function adicionarEvidencias(
  ex: Executor, iniciativaId: number, universidadeId: number, evidencias: IniciativaEntrada["evidencias"],
  usuarioId: number | null, origem: string, verificacao = "nao_verificado",
) {
  for (const ev of evidencias) {
    const fonteId = await obterOuCriarFonte(ex, {
      url: ev.url, titulo: ev.titulo, tipo_fonte: ev.tipo_fonte, data_consulta: ev.data_consulta ?? new Date(),
      data_publicacao: ev.data_publicacao, universidade_id: universidadeId, origem_dados: origem as "real",
    });
    await ex.query(
      `INSERT INTO evidencias (iniciativa_id, fonte_id, trecho_evidencia, data_consulta, criado_por, verificacao_trecho)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [iniciativaId, fonteId, ev.trecho_evidencia, ev.data_consulta ?? new Date(), usuarioId, verificacao],
    );
  }
  // Data da evidência mais recente = maior data de publicação conhecida das fontes.
  await ex.query(
    `UPDATE iniciativas SET data_ultima_evidencia = COALESCE(
        (SELECT max(f.data_publicacao) FROM evidencias e JOIN fontes f ON f.id = e.fonte_id WHERE e.iniciativa_id = $1),
        data_ultima_evidencia)
      WHERE id = $1`,
    [iniciativaId],
  );
}

async function gravarRelacionamentos(ex: Executor, id: number, d: IniciativaEntrada, cats: Map<string, number>) {
  await ex.query("DELETE FROM iniciativa_categorias_secundarias WHERE iniciativa_id = $1", [id]);
  for (const c of d.categorias_secundarias)
    await ex.query("INSERT INTO iniciativa_categorias_secundarias VALUES ($1,$2)", [id, cats.get(c)]);
  await ex.query("DELETE FROM iniciativa_publicos WHERE iniciativa_id = $1", [id]);
  for (const p of await idsPublicos(ex, d.publicos)) await ex.query("INSERT INTO iniciativa_publicos VALUES ($1,$2)", [id, p]);
  if (d.documentos_ids.length) {
    const docs = await ex.query("SELECT id FROM documentos WHERE id = ANY($1) AND universidade_id = $2", [d.documentos_ids, d.universidade_id]);
    if (docs.rowCount !== new Set(d.documentos_ids).size)
      throw new ErroHttp(400, "Documento inexistente ou de outra universidade.");
  }
  await ex.query("DELETE FROM iniciativa_documentos WHERE iniciativa_id = $1", [id]);
  for (const doc of new Set(d.documentos_ids)) await ex.query("INSERT INTO iniciativa_documentos VALUES ($1,$2)", [id, doc]);
}

async function validarReferencias(ex: Executor, d: IniciativaEntrada) {
  const u = await ex.query("SELECT 1 FROM universidades WHERE id = $1", [d.universidade_id]);
  if (!u.rowCount) throw new ErroHttp(400, "Universidade inexistente.");
  if (d.campus_id) {
    const c = await ex.query("SELECT 1 FROM campi WHERE id = $1 AND universidade_id = $2", [d.campus_id, d.universidade_id]);
    if (!c.rowCount) throw new ErroHttp(400, "O campus informado não pertence à universidade.");
  }
}

const COLUNAS_ESCALARES = [
  "nome", "descricao", "objetivos", "universidade_id", "campus_id", "unidade_responsavel", "modalidade", "abrangencia",
  "data_inicio", "data_fim", "situacao_documentada", "periodicidade", "grau_evidencia", "status_validacao", "limitacoes",
  "data_ultima_evidencia",
] as const;

export interface OpcoesCriacao {
  origem?: "real" | "demonstrativo";
  verificacaoEvidencias?: string;
}

export async function criarIniciativa(ex: Executor, entrada: unknown, usuarioId: number | null, op: OpcoesCriacao = {}): Promise<number> {
  const d = esquemaIniciativaEntrada.parse(entrada);
  await validarReferencias(ex, d);
  const cats = await idsCategorias(ex, [d.categoria_principal, ...d.categorias_secundarias]);
  const sigla = (await ex.query<{ sigla: string | null }>("SELECT sigla FROM universidades WHERE id = $1", [d.universidade_id])).rows[0].sigla;
  const valores = COLUNAS_ESCALARES.map((c) => d[c]);
  const r = await ex.query<{ id: number }>(
    `INSERT INTO iniciativas (${COLUNAS_ESCALARES.join(", ")}, categoria_principal_id, slug, origem_dados, data_ultima_verificacao,
                              validado_por, validado_em)
     VALUES (${COLUNAS_ESCALARES.map((_, i) => `$${i + 1}`).join(", ")}, $${COLUNAS_ESCALARES.length + 1}, $${COLUNAS_ESCALARES.length + 2},
             $${COLUNAS_ESCALARES.length + 3}, now(), $${COLUNAS_ESCALARES.length + 4}, $${COLUNAS_ESCALARES.length + 5})
     RETURNING id`,
    [
      ...valores, cats.get(d.categoria_principal), await slugUnico(ex, d.nome, sigla), op.origem ?? "real",
      d.status_validacao === "validada" ? usuarioId : null, d.status_validacao === "validada" ? new Date() : null,
    ],
  );
  const id = r.rows[0].id;
  await gravarRelacionamentos(ex, id, d, cats);
  await adicionarEvidencias(ex, id, d.universidade_id, d.evidencias, usuarioId, op.origem ?? "real", op.verificacaoEvidencias);
  if (d.status_validacao === "validada") await verificarRegrasDeValidacao(ex, id);
  await registrarAlteracoes(ex, "iniciativas", id, null, { ...pick(d), categoria_principal: d.categoria_principal }, usuarioId, d.justificativa ?? "Criação do registro");
  await detectarDuplicidades(ex, id);
  await recalcularSituacao(ex, d.universidade_id, usuarioId);
  return id;
}

const pick = (d: IniciativaEntrada) => Object.fromEntries(COLUNAS_ESCALARES.map((c) => [c, d[c]]));

export async function atualizarIniciativa(ex: Executor, id: number, entrada: unknown, usuarioId: number): Promise<void> {
  const d = esquemaIniciativaEntrada.parse(entrada);
  const antes = (await ex.query(
    `SELECT i.*, c.codigo AS categoria_principal FROM iniciativas i JOIN categorias c ON c.id = i.categoria_principal_id
      WHERE i.id = $1 FOR UPDATE OF i`, [id],
  )).rows[0];
  if (!antes) throw new ErroHttp(404, "Iniciativa não encontrada.");
  await validarReferencias(ex, d);
  const cats = await idsCategorias(ex, [d.categoria_principal, ...d.categorias_secundarias]);
  const sets = COLUNAS_ESCALARES.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const tornouValidada = d.status_validacao === "validada" && antes.status_validacao !== "validada";
  await ex.query(
    `UPDATE iniciativas SET ${sets}, categoria_principal_id = $${COLUNAS_ESCALARES.length + 2}, data_ultima_verificacao = now()
       ${tornouValidada ? `, validado_por = $${COLUNAS_ESCALARES.length + 3}, validado_em = now()` : ""}
     WHERE id = $1`,
    [id, ...COLUNAS_ESCALARES.map((c) => d[c]), cats.get(d.categoria_principal), ...(tornouValidada ? [usuarioId] : [])],
  );
  await gravarRelacionamentos(ex, id, d, cats);
  await adicionarEvidencias(ex, id, d.universidade_id, d.evidencias, usuarioId, antes.origem_dados);
  if (d.status_validacao === "validada") await verificarRegrasDeValidacao(ex, id);
  await registrarAlteracoes(ex, "iniciativas", id, antes, { ...pick(d), categoria_principal: d.categoria_principal }, usuarioId, d.justificativa);
  await recalcularSituacao(ex, d.universidade_id, usuarioId);
  if (antes.universidade_id !== d.universidade_id) await recalcularSituacao(ex, antes.universidade_id, usuarioId);
}

export async function alterarStatus(ex: Executor, id: number, status: string, usuarioId: number, justificativa: string) {
  const antes = (await ex.query("SELECT status_validacao, universidade_id FROM iniciativas WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!antes) throw new ErroHttp(404, "Iniciativa não encontrada.");
  await ex.query(
    `UPDATE iniciativas SET status_validacao = $2, data_ultima_verificacao = now()
       ${status === "validada" ? ", validado_por = $3, validado_em = now()" : ""} WHERE id = $1`,
    status === "validada" ? [id, status, usuarioId] : [id, status],
  );
  if (status === "validada") await verificarRegrasDeValidacao(ex, id);
  await registrarAlteracoes(ex, "iniciativas", id, { status_validacao: antes.status_validacao }, { status_validacao: status }, usuarioId, justificativa);
  await recalcularSituacao(ex, antes.universidade_id, usuarioId);
}

// ---------------------------------------------------------------------------
// Duplicidades
// ---------------------------------------------------------------------------

export const LIMIAR_SIMILARIDADE = 0.45;

/** Registra pares semelhantes (mesma universidade) para revisão humana. Nunca exclui registros. */
export async function detectarDuplicidades(ex: Executor, id: number): Promise<number> {
  const r = await ex.query(
    `INSERT INTO possiveis_duplicidades (iniciativa_a, iniciativa_b, similaridade, motivo)
     SELECT LEAST(i.id, o.id), GREATEST(i.id, o.id),
            GREATEST(similarity(f_normalizar(i.nome), f_normalizar(o.nome)), CASE WHEN fonte_comum.x THEN 1 ELSE 0 END),
            CASE WHEN fonte_comum.x AND similarity(f_normalizar(i.nome), f_normalizar(o.nome)) >= $2 THEN 'nome semelhante e mesma fonte'
                 WHEN fonte_comum.x THEN 'mesma fonte' ELSE 'nome semelhante' END
       FROM iniciativas i
       JOIN iniciativas o ON o.universidade_id = i.universidade_id AND o.id <> i.id AND o.status_validacao NOT IN ('rejeitada', 'arquivada')
       CROSS JOIN LATERAL (SELECT EXISTS (
            SELECT 1 FROM evidencias a JOIN evidencias b ON a.fonte_id = b.fonte_id
             WHERE a.iniciativa_id = i.id AND b.iniciativa_id = o.id) AS x) fonte_comum
      WHERE i.id = $1
        AND (similarity(f_normalizar(i.nome), f_normalizar(o.nome)) >= $2
             OR (fonte_comum.x AND similarity(f_normalizar(i.nome), f_normalizar(o.nome)) >= 0.25))
     ON CONFLICT (iniciativa_a, iniciativa_b) DO NOTHING`,
    [id, LIMIAR_SIMILARIDADE],
  );
  return r.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface FiltrosIniciativas {
  q?: string;
  universidade_id: number[];
  regiao: string[];
  estado: string[];
  categoria: string[];
  incluir_secundarias?: boolean;
  publico: string[];
  situacao_documentada: string[];
  grau_evidencia: number[];
  categoria_administrativa: string[];
  tem_documento_normativo?: boolean;
  status_validacao: string[];
  demo?: boolean;
  ordenar?: "nome" | "universidade" | "recentes" | "grau";
}

/** Monta os filtros. Em modo público, só iniciativas validadas e (salvo pedido) somente dados reais. */
export function filtrosIniciativas(f: FiltrosIniciativas, publico: boolean): Filtros {
  const w = new Filtros();
  if (publico) w.addLiteral("i.status_validacao = 'validada'");
  else if (f.status_validacao.length) w.add((p) => `i.status_validacao = ANY(${p})`, f.status_validacao);
  if (!f.demo) w.addLiteral("i.origem_dados = 'real'");
  if (f.q) {
    const p = w.param(`%${f.q}%`);
    w.addLiteral(`f_normalizar(i.nome || ' ' || coalesce(i.descricao,'') || ' ' || coalesce(i.unidade_responsavel,'') || ' ' || u.nome_oficial || ' ' || coalesce(u.sigla,'')) LIKE f_normalizar(${p})`);
  }
  if (f.universidade_id.length) w.add((p) => `i.universidade_id = ANY(${p})`, f.universidade_id);
  if (f.regiao.length) w.add((p) => `u.regiao = ANY(${p})`, f.regiao);
  if (f.estado.length) w.add((p) => `u.estado = ANY(${p})`, f.estado);
  if (f.categoria_administrativa.length) w.add((p) => `u.categoria_administrativa = ANY(${p})`, f.categoria_administrativa);
  if (f.categoria.length) {
    const p = w.param(f.categoria);
    w.addLiteral(
      f.incluir_secundarias
        ? `(c.codigo = ANY(${p}) OR EXISTS (SELECT 1 FROM iniciativa_categorias_secundarias s JOIN categorias cs ON cs.id = s.categoria_id
              WHERE s.iniciativa_id = i.id AND cs.codigo = ANY(${p})))`
        : `c.codigo = ANY(${p})`,
    );
  }
  if (f.publico.length)
    w.add((p) => `EXISTS (SELECT 1 FROM iniciativa_publicos ip JOIN publicos_alvo pa ON pa.id = ip.publico_alvo_id
                           WHERE ip.iniciativa_id = i.id AND pa.codigo = ANY(${p}))`, f.publico);
  if (f.situacao_documentada.length) w.add((p) => `i.situacao_documentada = ANY(${p})`, f.situacao_documentada);
  if (f.grau_evidencia.length) w.add((p) => `i.grau_evidencia = ANY(${p})`, f.grau_evidencia);
  if (f.tem_documento_normativo !== undefined) {
    const p = w.param(TIPOS_DOCUMENTO_NORMATIVO);
    w.addLiteral(`${f.tem_documento_normativo ? "" : "NOT "}EXISTS (SELECT 1 FROM iniciativa_documentos idoc JOIN documentos d ON d.id = idoc.documento_id
                  WHERE idoc.iniciativa_id = i.id AND d.tipo_documento = ANY(${p}))`);
  }
  return w;
}

const ORDENACAO: Record<string, string> = {
  nome: "f_normalizar(i.nome)",
  universidade: "f_normalizar(u.nome_oficial), f_normalizar(i.nome)",
  recentes: "i.validado_em DESC NULLS LAST, i.id DESC",
  grau: "i.grau_evidencia, f_normalizar(i.nome)",
};

export const SELECT_INICIATIVA = `
  i.id, i.slug, i.nome, i.descricao, i.objetivos, i.unidade_responsavel, i.modalidade, i.abrangencia,
  i.data_inicio, i.data_fim, i.situacao_documentada, i.periodicidade, i.grau_evidencia, i.status_validacao,
  i.limitacoes, i.data_ultima_evidencia, i.data_ultima_verificacao, i.origem_dados, i.validado_em,
  c.codigo AS categoria_principal, c.nome AS categoria_principal_nome,
  u.id AS universidade_id, u.nome_oficial AS universidade_nome, u.sigla AS universidade_sigla,
  u.estado, u.regiao, u.categoria_administrativa,
  ca.nome AS campus_nome,
  (SELECT coalesce(array_agg(pa.codigo ORDER BY pa.ordem), '{}') FROM iniciativa_publicos ip JOIN publicos_alvo pa ON pa.id = ip.publico_alvo_id WHERE ip.iniciativa_id = i.id) AS publicos,
  (SELECT coalesce(array_agg(cs.codigo ORDER BY cs.ordem), '{}') FROM iniciativa_categorias_secundarias s JOIN categorias cs ON cs.id = s.categoria_id WHERE s.iniciativa_id = i.id) AS categorias_secundarias,
  (SELECT count(*) FROM evidencias e WHERE e.iniciativa_id = i.id) AS n_evidencias,
  EXISTS (SELECT 1 FROM iniciativa_documentos idoc JOIN documentos d ON d.id = idoc.documento_id
           WHERE idoc.iniciativa_id = i.id AND d.tipo_documento IN (${TIPOS_DOCUMENTO_NORMATIVO.map((t) => `'${t}'`).join(",")})) AS tem_documento_normativo,
  CASE WHEN i.data_ultima_evidencia IS NULL THEN 'desconhecida'
       WHEN i.data_ultima_evidencia < (current_date - interval '${MESES_ATUALIDADE} months') THEN 'desatualizada'
       ELSE 'recente' END AS atualidade_fonte`;

export const FROM_INICIATIVA = `
  FROM iniciativas i
  JOIN universidades u ON u.id = i.universidade_id
  JOIN categorias c ON c.id = i.categoria_principal_id
  LEFT JOIN campi ca ON ca.id = i.campus_id`;

export async function listarIniciativas(f: FiltrosIniciativas, pg: Paginacao | null, publico: boolean) {
  const w = filtrosIniciativas(f, publico);
  const ordem = ORDENACAO[f.ordenar ?? "universidade"] ?? ORDENACAO.universidade;
  const limite = pg ? `LIMIT ${pg.por_pagina} OFFSET ${offsetDe(pg)}` : "";
  const [itens, total] = await Promise.all([
    pool.query(`SELECT ${SELECT_INICIATIVA} ${FROM_INICIATIVA} ${w.where} ORDER BY ${ordem} ${limite}`, w.params),
    pool.query<{ n: number }>(`SELECT count(*) AS n ${FROM_INICIATIVA} ${w.where}`, w.params),
  ]);
  return pg ? respostaPaginada(itens.rows, total.rows[0].n, pg) : { itens: itens.rows, total: total.rows[0].n };
}

export async function detalharIniciativa(id: number, publico: boolean, demo = false) {
  const cond = publico ? `AND i.status_validacao = 'validada' ${demo ? "" : "AND i.origem_dados = 'real'"}` : "";
  const ini = (await pool.query(`SELECT ${SELECT_INICIATIVA}, i.campus_id ${FROM_INICIATIVA} WHERE i.id = $1 ${cond}`, [id])).rows[0];
  if (!ini) throw new ErroHttp(404, "Iniciativa não encontrada.");
  const [documentos, evidencias, relacoes] = await Promise.all([
    pool.query(
      `SELECT d.id, d.titulo, d.tipo_documento, d.numero_documento, d.data_publicacao, d.orgao_emissor, d.url_original, d.descricao
         FROM iniciativa_documentos idoc JOIN documentos d ON d.id = idoc.documento_id WHERE idoc.iniciativa_id = $1
        ORDER BY d.data_publicacao DESC NULLS LAST`, [id]),
    pool.query(
      `SELECT e.id, e.trecho_evidencia, e.data_consulta, e.verificacao_trecho,
              f.id AS fonte_id, f.url_original, f.titulo AS fonte_titulo, f.tipo_fonte, f.data_publicacao, f.situacao_fonte
         FROM evidencias e JOIN fontes f ON f.id = e.fonte_id WHERE e.iniciativa_id = $1 ORDER BY e.data_consulta DESC`, [id]),
    pool.query(
      `SELECT r.id, r.tipo, r.observacao, CASE WHEN r.origem_id = $1 THEN 'saida' ELSE 'entrada' END AS direcao,
              o.id AS iniciativa_id, o.nome, o.status_validacao, c.codigo AS categoria_principal
         FROM iniciativa_relacoes r
         JOIN iniciativas o ON o.id = CASE WHEN r.origem_id = $1 THEN r.destino_id ELSE r.origem_id END
         JOIN categorias c ON c.id = o.categoria_principal_id
        WHERE (r.origem_id = $1 OR r.destino_id = $1) ${publico ? "AND o.status_validacao = 'validada' AND r.tipo <> 'duplicata_de'" : ""}`,
      [id]),
  ]);
  return { ...ini, documentos: documentos.rows, evidencias: evidencias.rows, relacoes: relacoes.rows };
}
