import type { Executor } from "../db.js";
import { normalizarUrl } from "../lib/url.js";

export interface FonteEntrada {
  url: string;
  titulo?: string | null;
  tipo_fonte: string;
  data_consulta?: string | Date | null;
  data_publicacao?: string | null;
  universidade_id?: number | null;
  situacao_fonte?: string;
  origem_dados?: "real" | "demonstrativo";
}

/** Retorna a fonte com a mesma URL canônica ou cria uma nova (deduplicação por URL). */
export async function obterOuCriarFonte(ex: Executor, f: FonteEntrada): Promise<number> {
  const canonica = normalizarUrl(f.url);
  const existente = await ex.query<{ id: number }>("SELECT id FROM fontes WHERE url_canonica = $1", [canonica]);
  if (existente.rows[0]) {
    // Atualiza a data de consulta quando a nova consulta é mais recente.
    await ex.query(
      `UPDATE fontes SET data_consulta = GREATEST(data_consulta, $2::timestamptz),
              titulo = COALESCE(titulo, $3), data_publicacao = COALESCE(data_publicacao, $4)
        WHERE id = $1`,
      [existente.rows[0].id, f.data_consulta ?? new Date(), f.titulo ?? null, f.data_publicacao ?? null],
    );
    return existente.rows[0].id;
  }
  const r = await ex.query<{ id: number }>(
    `INSERT INTO fontes (url_original, url_canonica, titulo, tipo_fonte, data_publicacao, data_consulta, situacao_fonte, universidade_id, origem_dados)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      f.url.trim(), canonica, f.titulo ?? null, f.tipo_fonte, f.data_publicacao ?? null,
      f.data_consulta ?? new Date(), f.situacao_fonte ?? "acessivel", f.universidade_id ?? null, f.origem_dados ?? "real",
    ],
  );
  return r.rows[0].id;
}
