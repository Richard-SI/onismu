/**
 * Backup lógico do banco com pg_dump executado dentro do contêiner do Docker Compose.
 * Gera backups/onismu_AAAAMMDD_HHMMSS.dump (formato custom; restaure com pg_restore).
 * Uso: npm run backup -w server
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RAIZ_PROJETO } from "../config.js";

const pasta = path.join(RAIZ_PROJETO, "backups");
fs.mkdirSync(pasta, { recursive: true });
const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
const destino = path.join(pasta, `onismu_${carimbo}.dump`);
const dump = execFileSync("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", "onismu", "-d", "onismu", "-Fc"], {
  cwd: RAIZ_PROJETO, maxBuffer: 1024 * 1024 * 1024,
});
fs.writeFileSync(destino, dump);
console.log(`Backup gravado em ${destino} (${(dump.length / 1024).toFixed(0)} KB)`);
