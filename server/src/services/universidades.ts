import type { Executor } from "../db.js";
import { SITUACOES_CONCLUIDAS } from "../dominio.js";
import { ErroHttp } from "../lib/erros.js";
import { registrarAlteracoes } from "../lib/historico.js";

async function contarValidadas(ex: Executor, universidadeId: number): Promise<number> {
  const r = await ex.query<{ n: number }>(
    "SELECT count(*) AS n FROM iniciativas WHERE universidade_id = $1 AND status_validacao = 'validada'",
    [universidadeId],
  );
  return r.rows[0].n;
}

async function mudarSituacao(ex: Executor, id: number, nova: string, usuarioId: number | null, justificativa: string) {
  const atual = await ex.query<{ situacao_pesquisa: string }>("SELECT situacao_pesquisa FROM universidades WHERE id = $1 FOR UPDATE", [id]);
  if (!atual.rows[0]) throw new ErroHttp(404, "Universidade não encontrada.");
  if (atual.rows[0].situacao_pesquisa === nova) return;
  await ex.query("UPDATE universidades SET situacao_pesquisa = $2 WHERE id = $1", [id, nova]);
  await registrarAlteracoes(ex, "universidades", id, { situacao_pesquisa: atual.rows[0].situacao_pesquisa }, { situacao_pesquisa: nova }, usuarioId, justificativa);
}

/**
 * Mantém a coerência entre a situação "concluída" e as iniciativas validadas:
 * uma universidade concluída passa a "com iniciativas" se houver ao menos uma validada, e vice-versa.
 * Situações não concluídas não são alteradas automaticamente — essa decisão é do pesquisador.
 */
export async function recalcularSituacao(ex: Executor, universidadeId: number, usuarioId: number | null) {
  const r = await ex.query<{ situacao_pesquisa: string }>("SELECT situacao_pesquisa FROM universidades WHERE id = $1", [universidadeId]);
  const s = r.rows[0]?.situacao_pesquisa;
  if (!s || !(SITUACOES_CONCLUIDAS as readonly string[]).includes(s)) return;
  const n = await contarValidadas(ex, universidadeId);
  const nova = n > 0 ? "concluida_com_iniciativas" : "concluida_sem_iniciativas";
  if (nova !== s) await mudarSituacao(ex, universidadeId, nova, usuarioId, "Recalculado a partir das iniciativas validadas.");
}

/**
 * Encerra o procedimento de pesquisa de uma universidade.
 * Só é permitido se houver registro de fontes efetivamente consultadas (não se declara
 * pesquisada uma instituição sem consulta documentada).
 */
export async function concluirPesquisa(
  ex: Executor,
  universidadeId: number,
  resultado: "concluida" | "inconclusiva",
  usuarioId: number,
  justificativa: string,
) {
  const consultadas = await ex.query<{ n: number }>(
    `SELECT count(*) AS n FROM coleta_paginas p JOIN coleta_execucoes e ON e.id = p.execucao_id
      WHERE e.universidade_id = $1 AND p.status IN ('relevante', 'sem_termos', 'consultada')`,
    [universidadeId],
  );
  if (consultadas.rows[0].n === 0) {
    throw new ErroHttp(422, "Não há fontes consultadas registradas para esta universidade; a pesquisa não pode ser declarada concluída.");
  }
  const pendentes = await ex.query<{ n: number }>(
    "SELECT count(*) AS n FROM candidatos WHERE universidade_id = $1 AND status = 'pendente'",
    [universidadeId],
  );
  if (resultado === "concluida" && pendentes.rows[0].n > 0) {
    throw new ErroHttp(422, `Ainda há ${pendentes.rows[0].n} candidato(s) aguardando revisão.`);
  }
  let nova: string = "inconclusiva";
  if (resultado === "concluida") {
    nova = (await contarValidadas(ex, universidadeId)) > 0 ? "concluida_com_iniciativas" : "concluida_sem_iniciativas";
  }
  await mudarSituacao(ex, universidadeId, nova, usuarioId, justificativa);
  await ex.query("UPDATE universidades SET data_ultima_verificacao = now() WHERE id = $1", [universidadeId]);
  return nova;
}

export { mudarSituacao };
