import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const aqui = path.dirname(fileURLToPath(import.meta.url));
// src/ (tsx) ou dist/src/ (build): a raiz do monorepo fica alguns níveis acima.
export const RAIZ_SERVIDOR = aqui.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(aqui, "..", "..")
  : path.resolve(aqui, "..");
export const RAIZ_PROJETO = path.resolve(RAIZ_SERVIDOR, "..");

dotenv.config({ path: path.join(RAIZ_PROJETO, ".env"), quiet: true });

const booleano = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const esquema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  SESSAO_HORAS: z.coerce.number().positive().default(12),
  BUSCA_PROVEDOR: z.enum(["nenhum", "brave", "searxng"]).default("nenhum"),
  BRAVE_API_KEY: z.string().optional(),
  SEARXNG_URL: z.string().url().default("http://127.0.0.1:8888"),
  BUSCA_INTERVALO_MS: z.coerce.number().int().min(0).max(60_000).default(5000),
  EXTRATOR: z.enum(["claude", "ollama", "heuristico"]).default("heuristico"),
  OLLAMA_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODELO: z.string().default("qwen2.5:7b"),
  OLLAMA_CONTEXTO: z.coerce.number().int().min(2048).max(131072).default(16384),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(1_800_000).default(600_000),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODELO: z.string().default("claude-opus-5-5"),
  COLETA_MAX_PAGINAS: z.coerce.number().int().min(1).max(200).default(25),
  COLETA_MAX_BYTES: z.coerce.number().int().min(10_000).max(50_000_000).default(5_000_000),
  COLETA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  COLETA_INTERVALO_HOST_MS: z.coerce.number().int().min(0).max(60_000).default(1500),
  COLETA_CONTATO: z.string().default("contato@exemplo.org"),
  COLETA_PERMITIR_REDE_PRIVADA: booleano,
});

const bruto = esquema.parse(process.env);

if (bruto.NODE_ENV === "production" && bruto.COLETA_PERMITIR_REDE_PRIVADA) {
  throw new Error("COLETA_PERMITIR_REDE_PRIVADA não pode ser habilitada em produção.");
}

export const config = {
  ...bruto,
  databaseUrl: bruto.NODE_ENV === "test" && bruto.TEST_DATABASE_URL ? bruto.TEST_DATABASE_URL : bruto.DATABASE_URL,
  corsOrigins: bruto.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  producao: bruto.NODE_ENV === "production",
};

export type Config = typeof config;
