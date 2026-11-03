import type { Executor } from "../db.js";

const serializar = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/**
 * Registra no histórico cada campo que mudou entre `antes` e `depois`.
 * Campos técnicos (updated_at etc.) são ignorados.
 */
export async function registrarAlteracoes(
  ex: Executor,
  entidade: string,
  registroId: number,
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown>,
  responsavelId: number | null,
  justificativa?: string | null,
): Promise<number> {
  const ignorar = new Set(["updated_at", "created_at", "id"]);
  let n = 0;
  for (const campo of Object.keys(depois)) {
    if (ignorar.has(campo)) continue;
    const a = antes ? serializar(antes[campo]) : null;
    const d = serializar(depois[campo]);
    if (antes && a === d) continue;
    if (!antes && d === null) continue;
    await ex.query(
      `INSERT INTO historico_alteracoes (entidade, registro_id, campo, valor_anterior, valor_novo, responsavel_id, justificativa)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entidade, registroId, campo, a, d, responsavelId, justificativa ?? null],
    );
    n++;
  }
  return n;
}
