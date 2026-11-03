import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { consultar, consultarUm } from "../db.js";
import { assinc, ErroHttp } from "../lib/erros.js";
import { verificarSenha } from "../lib/senhas.js";
import { criarSessao, encerrarSessao, exigirCabecalhoCsrf } from "../auth/sessao.js";

export const rotasAuth = Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { erro: "Muitas tentativas de acesso. Aguarde 15 minutos." },
});

// Hash fictício para equalizar o tempo de resposta quando o e-mail não existe.
const HASH_FALSO = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

rotasAuth.post("/login", limiteLogin, exigirCabecalhoCsrf, assinc(async (req, res) => {
  const { email, senha } = z.object({ email: z.string().trim().toLowerCase().email().max(200), senha: z.string().min(1).max(200) }).parse(req.body);
  const u = await consultarUm<{ id: number; senha_hash: string; ativo: boolean }>(
    "SELECT id, senha_hash, ativo FROM usuarios WHERE email = $1", [email]);
  const ok = await verificarSenha(senha, u?.senha_hash ?? HASH_FALSO);
  if (!u || !ok || !u.ativo) throw new ErroHttp(401, "E-mail ou senha inválidos.");
  await criarSessao(res, u.id);
  await consultar("UPDATE usuarios SET ultimo_login = now() WHERE id = $1", [u.id]);
  const usuario = await consultarUm("SELECT id, email, nome, papel FROM usuarios WHERE id = $1", [u.id]);
  res.json({ usuario });
}));

rotasAuth.post("/logout", exigirCabecalhoCsrf, assinc(async (req, res) => {
  await encerrarSessao(req, res);
  res.json({ ok: true });
}));

rotasAuth.get("/sessao", (req, res) => {
  res.json({ usuario: req.usuario ?? null });
});
