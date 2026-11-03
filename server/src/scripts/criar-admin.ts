/**
 * Cria (ou redefine a senha de) um usuário administrativo.
 * Uso: npm run criar-admin -w server -- --email pessoa@instituicao.br --nome "Nome" [--papel admin|pesquisador]
 * A senha é lida de ONISMU_SENHA ou digitada no terminal (não é exibida nem registrada).
 */
import readline from "node:readline";
import { pool } from "../db.js";
import { gerarHashSenha, validarForcaSenha } from "../lib/senhas.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

async function lerSenha(): Promise<string> {
  if (process.env.ONISMU_SENHA) return process.env.ONISMU_SENHA;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  (rl as any)._writeToOutput = (s: string) => { if (!s.includes("Senha")) return; (rl as any).output.write(s); };
  const s = await new Promise<string>((r) => rl.question("Senha (mín. 12 caracteres, letras e números): ", r));
  rl.close();
  process.stdout.write("\n");
  return s;
}

const email = arg("email")?.toLowerCase();
const nome = arg("nome") ?? email;
const papel = arg("papel") ?? "admin";
if (!email || !["admin", "pesquisador"].includes(papel)) {
  console.error('Uso: npm run criar-admin -w server -- --email pessoa@instituicao.br --nome "Nome" [--papel admin|pesquisador]');
  process.exit(1);
}
const senha = await lerSenha();
const fraca = validarForcaSenha(senha);
if (fraca) {
  console.error(fraca);
  process.exit(1);
}
await pool.query(
  `INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES ($1,$2,$3,$4)
   ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel = EXCLUDED.papel, nome = EXCLUDED.nome, ativo = true`,
  [email, nome, papel, await gerarHashSenha(senha)],
);
console.log(`Usuário ${email} (${papel}) pronto.`);
await pool.end();
