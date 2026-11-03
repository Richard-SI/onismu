import type { Executor } from "../db.js";
import { TIPOS_DOCUMENTO } from "../dominio.js";
import { ErroHttp } from "../lib/erros.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { normalizarUrl } from "../lib/url.js";
import { obterOuCriarFonte } from "./fontes.js";
import { criarIniciativa, LIMIAR_SIMILARIDADE } from "./iniciativas.js";

export interface PossivelDuplicata {
  tipo: "iniciativa" | "candidato";
  id: number;
  nome: string;
  status: string;
  similaridade: number;
  motivo: string;
}

/** Procura iniciativas e candidatos semelhantes na mesma universidade (nome ou mesma fonte). */
export async function sugerirDuplicatas(
  ex: Executor, universidadeId: number, nome: string, urlFonte: string, ignorarCandidatoId?: number,
): Promise<PossivelDuplicata[]> {
  let canonica: string | null = null;
  try { canonica = normalizarUrl(urlFonte); } catch { /* URL inválida já é tratada na validação */ }
  const r = await ex.query<PossivelDuplicata>(
    `SELECT 'iniciativa' AS tipo, i.id, i.nome, i.status_validacao AS status,
            round(similarity(f_normalizar(i.nome), f_normalizar($2))::numeric, 2)::float AS similaridade,
            CASE WHEN EXISTS (SELECT 1 FROM evidencias e JOIN fontes f ON f.id = e.fonte_id WHERE e.iniciativa_id = i.id AND f.url_canonica = $3)
                 THEN 'mesma fonte' ELSE 'nome semelhante' END AS motivo
       FROM iniciativas i
      WHERE i.universidade_id = $1 AND i.status_validacao NOT IN ('rejeitada', 'arquivada')
        AND (similarity(f_normalizar(i.nome), f_normalizar($2)) >= $4
             OR EXISTS (SELECT 1 FROM evidencias e JOIN fontes f ON f.id = e.fonte_id WHERE e.iniciativa_id = i.id AND f.url_canonica = $3))
     UNION ALL
     SELECT 'candidato', c.id, c.nome, c.status,
            round(similarity(f_normalizar(c.nome), f_normalizar($2))::numeric, 2)::float,
            'nome semelhante (candidato)'
       FROM candidatos c
      WHERE c.universidade_id = $1 AND c.status = 'pendente' AND c.id <> coalesce($5, -1)
        AND similarity(f_normalizar(c.nome), f_normalizar($2)) >= $4
      ORDER BY similaridade DESC LIMIT 10`,
    [universidadeId, nome, canonica, LIMIAR_SIMILARIDADE, ignorarCandidatoId ?? null],
  );
  return r.rows;
}

async function carregarPendente(ex: Executor, id: number) {
  const c = (await ex.query(
    `SELECT c.*, e.iniciada_em AS execucao_data, p.consultada_em AS pagina_consultada_em
       FROM candidatos c JOIN coleta_execucoes e ON e.id = c.execucao_id LEFT JOIN coleta_paginas p ON p.id = c.pagina_id
      WHERE c.id = $1 FOR UPDATE OF c`, [id],
  )).rows[0];
  if (!c) throw new ErroHttp(404, "Candidato não encontrado.");
  if (c.status !== "pendente" && c.status !== "recoleta_solicitada")
    throw new ErroHttp(409, `Este candidato já foi decidido (${c.status}).`);
  return c;
}

const PUBLICOS_CONHECIDOS = new Set([
  "estudantes", "estudantes_graduacao", "pos_graduandos", "docentes", "tecnicos_administrativos", "servidores",
  "comunidade_universitaria", "comunidade_externa", "estudantes_assistencia", "outros",
]);

const nulo = (v: unknown) => (v === undefined || v === null || v === "" || v === "desconhecido" || v === "nao_localizado" ? null : v);

/** Converte a extração do candidato em entrada de iniciativa (o pesquisador pode sobrescrever qualquer campo). */
export function entradaAPartirDoCandidato(c: any): Record<string, unknown> {
  const d = c.dados ?? {};
  const publicos = [...new Set(((d.publico_alvo ?? []) as string[]).map((p) => (PUBLICOS_CONHECIDOS.has(p) ? p : "outros")))];
  const situacao = ["ativa", "encerrada"].includes(d.situacao_aparente) ? d.situacao_aparente : "desconhecida";
  return {
    nome: c.nome,
    descricao: nulo(d.descricao),
    objetivos: nulo(d.objetivos),
    universidade_id: c.universidade_id,
    unidade_responsavel: nulo(d.unidade_responsavel),
    categoria_principal: c.categoria_sugerida,
    categorias_secundarias: ((d.categorias_secundarias ?? []) as string[]).filter((x) => x !== c.categoria_sugerida),
    publicos,
    modalidade: ["presencial", "online", "hibrida"].includes(d.modalidade) ? d.modalidade : null,
    abrangencia: ["institucional", "campus", "unidade", "externa"].includes(d.abrangencia) ? d.abrangencia : null,
    situacao_documentada: situacao,
    grau_evidencia: c.grau_evidencia_sugerido,
    limitacoes: c.campos_ausentes?.length ? `Informações não localizadas na fonte: ${c.campos_ausentes.join(", ")}.` : null,
    data_ultima_evidencia: nulo(d.data_publicacao_fonte),
  };
}

async function criarDocumentoRelacionado(ex: Executor, universidadeId: number, doc: any, origem: string): Promise<number | null> {
  if (!doc?.titulo || !doc?.url_original) return null;
  let urlNorm: string;
  try { urlNorm = normalizarUrl(doc.url_original); } catch { return null; }
  const tipo = (TIPOS_DOCUMENTO as readonly string[]).includes(doc.tipo_documento) ? doc.tipo_documento : "outro";
  const r = await ex.query<{ id: number }>(
    `INSERT INTO documentos (titulo, tipo_documento, numero_documento, data_publicacao, orgao_emissor, url_original, url_normalizada, universidade_id, origem_dados)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (universidade_id, url_normalizada) WHERE url_normalizada IS NOT NULL DO UPDATE SET titulo = documentos.titulo
     RETURNING id`,
    [doc.titulo, tipo, nulo(doc.numero_documento), /^\d{4}-\d{2}-\d{2}$/.test(doc.data_publicacao ?? "") ? doc.data_publicacao : null,
      nulo(doc.orgao_emissor), doc.url_original, urlNorm, universidadeId, origem],
  );
  return r.rows[0].id;
}

async function registrarDecisao(ex: Executor, c: any, status: string, usuarioId: number, motivo: string | null, iniciativaId: number | null = null) {
  await ex.query(
    `UPDATE candidatos SET status = $2, decidido_por = $3, decidido_em = now(), motivo_decisao = $4, iniciativa_id = $5 WHERE id = $1`,
    [c.id, status, usuarioId, motivo, iniciativaId],
  );
  await registrarAlteracoes(ex, "candidatos", c.id, { status: c.status }, { status }, usuarioId, motivo);
}

/**
 * Aprova (opcionalmente com edições) e publica: cria a iniciativa validada com a evidência do candidato.
 * A evidência registrada é sempre a fonte e o trecho do candidato — não é possível aprovar sem evidência.
 */
export async function aprovarCandidato(ex: Executor, id: number, usuarioId: number, edicoes: Record<string, unknown> = {}, justificativa?: string) {
  const c = await carregarPendente(ex, id);
  const origem = (await ex.query<{ origem_dados: string }>("SELECT origem_dados FROM universidades WHERE id = $1", [c.universidade_id])).rows[0].origem_dados;
  const docId = await criarDocumentoRelacionado(ex, c.universidade_id, c.dados?.documento_relacionado, origem);
  const base = entradaAPartirDoCandidato(c);
  const entrada = {
    ...base,
    ...edicoes,
    universidade_id: c.universidade_id, // a universidade do candidato não muda na aprovação
    status_validacao: "validada",
    documentos_ids: [...new Set([...(docId ? [docId] : []), ...(((edicoes.documentos_ids as number[]) ?? []))])],
    evidencias: [{
      url: c.url_fonte,
      titulo: c.titulo_fonte,
      tipo_fonte: c.tipo_fonte,
      trecho_evidencia: c.trecho_evidencia,
      data_consulta: new Date(c.pagina_consultada_em ?? c.execucao_data).toISOString(),
      data_publicacao: nulo(c.dados?.data_publicacao_fonte),
    }],
    justificativa: justificativa ?? `Aprovado a partir do candidato #${c.id}`,
  };
  const iniciativaId = await criarIniciativa(ex, entrada, usuarioId, { origem: origem as "real", verificacaoEvidencias: c.verificacao_trecho });
  await registrarDecisao(ex, c, "aprovado", usuarioId, justificativa ?? (Object.keys(edicoes).length ? "Editado e aprovado" : "Aprovado"), iniciativaId);
  return iniciativaId;
}

export async function rejeitarCandidato(ex: Executor, id: number, usuarioId: number, motivo: string) {
  if (!motivo?.trim()) throw new ErroHttp(400, "Informe o motivo da rejeição.");
  const c = await carregarPendente(ex, id);
  await registrarDecisao(ex, c, "rejeitado", usuarioId, motivo);
}

export async function marcarInconclusivo(ex: Executor, id: number, usuarioId: number, motivo: string) {
  if (!motivo?.trim()) throw new ErroHttp(400, "Informe por que o candidato é inconclusivo.");
  const c = await carregarPendente(ex, id);
  await registrarDecisao(ex, c, "inconclusivo", usuarioId, motivo);
}

export async function solicitarRecoleta(ex: Executor, id: number, usuarioId: number, motivo: string) {
  const c = await carregarPendente(ex, id);
  await registrarDecisao(ex, c, "recoleta_solicitada", usuarioId, motivo || "Nova coleta solicitada");
}

/** Vincula o candidato a uma iniciativa existente, acrescentando a fonte/trecho como nova evidência. */
export async function vincularCandidato(ex: Executor, id: number, iniciativaId: number, usuarioId: number, motivo?: string) {
  const c = await carregarPendente(ex, id);
  const ini = (await ex.query("SELECT id, universidade_id FROM iniciativas WHERE id = $1", [iniciativaId])).rows[0];
  if (!ini) throw new ErroHttp(404, "Iniciativa não encontrada.");
  if (ini.universidade_id !== c.universidade_id) throw new ErroHttp(400, "A iniciativa pertence a outra universidade.");
  const fonteId = await obterOuCriarFonte(ex, {
    url: c.url_fonte, titulo: c.titulo_fonte, tipo_fonte: c.tipo_fonte,
    data_consulta: c.pagina_consultada_em ?? c.execucao_data, universidade_id: c.universidade_id,
  });
  await ex.query(
    `INSERT INTO evidencias (iniciativa_id, fonte_id, trecho_evidencia, data_consulta, criado_por, verificacao_trecho)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [iniciativaId, fonteId, c.trecho_evidencia, c.pagina_consultada_em ?? c.execucao_data, usuarioId, c.verificacao_trecho],
  );
  await ex.query("UPDATE iniciativas SET data_ultima_verificacao = now() WHERE id = $1", [iniciativaId]);
  await registrarAlteracoes(ex, "iniciativas", iniciativaId, null, { evidencia_adicionada: `fonte #${fonteId} (candidato #${c.id})` }, usuarioId, motivo);
  await registrarDecisao(ex, c, "vinculado", usuarioId, motivo ?? `Vinculado à iniciativa #${iniciativaId}`, iniciativaId);
}
