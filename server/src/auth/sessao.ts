import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { consultar, consultarUm } from "../db.js";
import { ErroHttp } from "../lib/erros.js";
import { gerarToken, hashToken } from "../lib/senhas.js";

export const COOKIE_SESSAO = "onismu_sessao";
/** Cabeçalho exigido em requisições administrativas que alteram dados (defesa adicional contra CSRF). */
export const CABECALHO_CSRF = "x-onismu-requisicao";

export type Papel = "admin" | "pesquisador";
export interface UsuarioSessao {
  id: number;
  email: string;
  nome: string;
  papel: Papel;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSessao;
    }
  }
}

export async function criarSessao(res: Response, usuarioId: number) {
  const token = gerarToken();
  const expira = new Date(Date.now() + config.SESSAO_HORAS * 3600_000);
  await consultar("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1,$2,$3)", [hashToken(token), usuarioId, expira]);
  await consultar("DELETE FROM sessoes WHERE expira_em < now()");
  res.cookie(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.producao,
    expires: expira,
    path: "/api",
  });
}

export async function encerrarSessao(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE_SESSAO];
  if (token) await consultar("DELETE FROM sessoes WHERE token_hash = $1", [hashToken(token)]);
  res.clearCookie(COOKIE_SESSAO, { path: "/api" });
}

/** Carrega o usuário da sessão, se houver (não exige autenticação). */
export async function carregarUsuario(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_SESSAO];
    if (typeof token === "string" && token.length > 20) {
      const u = await consultarUm<UsuarioSessao>(
        `SELECT u.id, u.email, u.nome, u.papel FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = $1 AND s.expira_em > now() AND u.ativo`,
        [hashToken(token)],
      );
      if (u) req.usuario = u;
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Exige sessão válida (e, opcionalmente, um dos papéis) — aplicado no servidor a toda rota administrativa. */
export const exigirAutenticacao =
  (...papeis: Papel[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) return next(new ErroHttp(401, "Autenticação necessária."));
    if (papeis.length && !papeis.includes(req.usuario.papel)) return next(new ErroHttp(403, "Permissão insuficiente."));
    next();
  };

export function exigirCabecalhoCsrf(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get(CABECALHO_CSRF) !== "1") return next(new ErroHttp(403, "Requisição sem cabeçalho de proteção."));
  next();
}
