import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (s: string, salt: Buffer, len: number, o: crypto.ScryptOptions) => Promise<Buffer>;
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Hash de senha com scrypt (salt aleatório). Formato: scrypt$N$r$p$salt$hash (base64). */
export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(senha, salt, 64, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, "base64");
  const obtido = await scrypt(senha, Buffer.from(saltB64, "base64"), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(esperado, obtido);
}

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 12) return "A senha deve ter ao menos 12 caracteres.";
  if (!/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) return "A senha deve conter letras e números.";
  return null;
}

export const gerarToken = () => crypto.randomBytes(32).toString("base64url");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
