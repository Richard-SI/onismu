import pg from "pg";
import { config } from "./config.js";

// Datas (tipo DATE) chegam como texto 'YYYY-MM-DD' para evitar deslocamento de fuso.
pg.types.setTypeParser(1082, (v) => v);
// COUNT(*) e bigint chegam como número (os volumes do observatório cabem em Number).
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export type Executor = pg.Pool | pg.PoolClient;

export async function consultar<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  executor: Executor = pool,
): Promise<T[]> {
  const r = await executor.query<T>(sql, params);
  return r.rows;
}

export async function consultarUm<T extends pg.QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  executor: Executor = pool,
): Promise<T | undefined> {
  const r = await executor.query<T>(sql, params);
  return r.rows[0];
}

export async function transacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
