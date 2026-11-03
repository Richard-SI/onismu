import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message);
  }
}

export const naoEncontrado = (o = "Registro") => new ErroHttp(404, `${o} não encontrado.`);
export const requisicaoInvalida = (m: string, d?: unknown) => new ErroHttp(400, m, d);
export const conflito = (m: string) => new ErroHttp(409, m);

/** Envolve handlers assíncronos para que erros cheguem ao tratador central. */
export const assinc =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function tratadorDeErros(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      erro: "Dados inválidos.",
      detalhes: err.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
    });
  }
  if (err instanceof ErroHttp) {
    return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
  }
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr?.code === "23505") return res.status(409).json({ erro: "Registro duplicado.", restricao: pgErr.constraint });
  if (pgErr?.code === "23503") return res.status(409).json({ erro: "Referência inválida ou registro em uso.", restricao: pgErr.constraint });
  if (pgErr?.code === "23514") return res.status(400).json({ erro: "Valor fora do domínio permitido.", restricao: pgErr.constraint });
  if (pgErr?.code === "22P02" || pgErr?.code === "22007" || pgErr?.code === "22008")
    return res.status(400).json({ erro: "Formato de valor inválido." });
  // Log sem corpo da requisição (pode conter credenciais).
  console.error(`[erro] ${req.method} ${req.path}:`, (err as Error)?.stack ?? err);
  return res.status(500).json({ erro: "Erro interno." });
}
