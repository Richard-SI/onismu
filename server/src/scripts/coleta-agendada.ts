/**
 * Executa as tarefas de atualização vencidas (agende via cron, ex.: diariamente às 3h):
 *   0 3 * * *  cd /caminho/onismu && npm run coleta:agendada -w server >> logs/coleta.log 2>&1
 * Requer provedor de busca configurado; sem ele, registra a pendência e não simula nada.
 */
import { statusBusca } from "../coleta/busca.js";
import { criarExecucao, enfileirarColeta } from "../coleta/fila.js";
import { pool } from "../db.js";

const busca = statusBusca();
const tarefas = (await pool.query(
  "SELECT * FROM tarefas_atualizacao WHERE ativa AND (proxima_execucao IS NULL OR proxima_execucao <= now()) ORDER BY id",
)).rows;
if (!tarefas.length) console.log("Nenhuma tarefa vencida.");
if (tarefas.length && !busca.disponivel) {
  console.error(`Tarefas vencidas não executadas: ${busca.motivo}`);
  await pool.end();
  process.exit(2);
}

for (const t of tarefas) {
  const e = t.escopo ?? {};
  const cond: string[] = ["origem_dados = 'real'"];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); cond.push(sql.replace("?", `$${p.length}`)); };
  if (e.estados?.length) add("estado = ANY(?)", e.estados);
  if (e.regioes?.length) add("regiao = ANY(?)", e.regioes);
  if (e.universidade_ids?.length) add("id = ANY(?)", e.universidade_ids);
  if (e.somente_situacoes?.length) add("situacao_pesquisa = ANY(?)", e.somente_situacoes);
  p.push(t.limite_por_execucao);
  const alvos = (await pool.query(
    `SELECT id, sigla FROM universidades WHERE ${cond.join(" AND ")}
      ORDER BY data_ultima_verificacao NULLS FIRST, id LIMIT $${p.length}`, p)).rows;
  console.log(`Tarefa "${t.nome}": ${alvos.length} universidade(s)`);
  for (const u of alvos) {
    try {
      const ex = await criarExecucao({ universidade_id: u.id, modo: "busca_api", observacoes: `Tarefa agendada #${t.id}` }, null);
      await enfileirarColeta(ex.id);
      const r = (await pool.query("SELECT status, candidatos_encontrados FROM coleta_execucoes WHERE id = $1", [ex.id])).rows[0];
      console.log(`  ${u.sigla ?? u.id}: ${ex.identificador} → ${r.status} (${r.candidatos_encontrados} candidatos)`);
    } catch (err) {
      console.error(`  ${u.sigla ?? u.id}: falhou — ${(err as Error).message}`);
    }
  }
  await pool.query(
    "UPDATE tarefas_atualizacao SET ultima_execucao = now(), proxima_execucao = now() + make_interval(days => periodicidade_dias) WHERE id = $1",
    [t.id]);
}
await pool.end();
