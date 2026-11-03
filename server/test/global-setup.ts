import pg from "pg";

/** Recria o esquema do banco de TESTES (nunca o banco principal) e aplica as migrações. */
export default async function () {
  process.env.NODE_ENV = "test";
  const { config } = await import("../src/config.js");
  const { aplicarMigracoes } = await import("../src/lib/migracoes.js");
  if (!config.TEST_DATABASE_URL || config.databaseUrl !== config.TEST_DATABASE_URL) {
    throw new Error("Defina TEST_DATABASE_URL (banco exclusivo para testes) no .env.");
  }
  if (!/test/.test(new URL(config.databaseUrl).pathname)) throw new Error("O banco de testes deve conter 'test' no nome.");
  const c = new pg.Client({ connectionString: config.databaseUrl });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  await aplicarMigracoes(config.databaseUrl, () => {});
}
