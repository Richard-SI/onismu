/**
 * Reverifica, na fonte original, os trechos de evidência de candidatos ainda não conferidos pelo sistema.
 * Uso: npm run verificar:trechos -w server [-- --todos] [-- --universidade SIGLA]
 */
import { pool } from "../db.js";
import { verificarTrechoCandidato } from "../coleta/verificar-trecho.js";

const todos = process.argv.includes("--todos");
const i = process.argv.indexOf("--universidade");
const sigla = i > -1 ? process.argv[i + 1] : null;
const r = await pool.query(
  `SELECT c.id, c.nome, u.sigla FROM candidatos c JOIN universidades u ON u.id = c.universidade_id
    WHERE c.status = 'pendente' ${todos ? "" : "AND c.verificacao_trecho IN ('nao_verificado', 'erro_acesso')"}
      ${sigla ? "AND upper(u.sigla) = upper($1)" : ""}
    ORDER BY u.sigla, c.id`, sigla ? [sigla] : []);
const contagem: Record<string, number> = {};
for (const c of r.rows) {
  const v = await verificarTrechoCandidato(c.id);
  contagem[v.resultado] = (contagem[v.resultado] ?? 0) + 1;
  console.log(`[${c.sigla}] #${c.id} ${v.resultado.padEnd(14)} ${c.nome.slice(0, 70)}${v.resultado !== "confirmado" ? `\n      ${v.detalhe}` : ""}`);
}
console.log("\nResumo:", contagem);
await pool.end();
