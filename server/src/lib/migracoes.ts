import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { RAIZ_SERVIDOR } from "../config.js";

const PASTA = path.join(RAIZ_SERVIDOR, "migrations");

/** Aplica, em ordem e dentro de transação, as migrações SQL ainda não registradas. */
export async function aplicarMigracoes(connectionString: string, log = console.log): Promise<string[]> {
  const cliente = new pg.Client({ connectionString });
  await cliente.connect();
  const aplicadas: string[] = [];
  try {
    await cliente.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);
    // Impede duas instâncias migrando simultaneamente.
    await cliente.query("SELECT pg_advisory_lock(424242)");
    const feitas = new Set(
      (await cliente.query<{ nome: string }>("SELECT nome FROM schema_migrations")).rows.map((r) => r.nome),
    );
    const arquivos = (await fs.readdir(PASTA)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
    for (const arq of arquivos) {
      if (feitas.has(arq)) continue;
      const sql = await fs.readFile(path.join(PASTA, arq), "utf8");
      await cliente.query("BEGIN");
      try {
        await cliente.query(sql);
        await cliente.query("INSERT INTO schema_migrations (nome) VALUES ($1)", [arq]);
        await cliente.query("COMMIT");
        aplicadas.push(arq);
        log(`migração aplicada: ${arq}`);
      } catch (e) {
        await cliente.query("ROLLBACK");
        throw new Error(`Falha na migração ${arq}: ${(e as Error).message}`);
      }
    }
    await cliente.query("SELECT pg_advisory_unlock(424242)");
  } finally {
    await cliente.end();
  }
  return aplicadas;
}
