import crypto from "node:crypto";
import os from "node:os";
import { pool } from "../db.js";
import { ErroHttp } from "../lib/erros.js";
import { validarUrlPublica } from "../lib/url.js";
import { executarColeta } from "./pipeline.js";

/**
 * Fila em processo, concorrência 1: coletas são lentas e devem ser gentis com os sites.
 * O estado é persistido no banco; execuções interrompidas por reinício são marcadas como tal.
 */
let cadeia: Promise<void> = Promise.resolve();
let pendentes = 0;

export function enfileirarColeta(execId: number): Promise<void> {
  pendentes++;
  const p = cadeia.then(async () => {
    try {
      await executarColeta(execId);
    } catch (e) {
      console.error(`[coleta] execução ${execId} falhou:`, (e as Error).message);
      await pool.query(
        `UPDATE coleta_execucoes SET status = 'falhou', finalizada_em = now(),
                erros = erros || $2::jsonb WHERE id = $1 AND status IN ('na_fila', 'em_andamento')`,
        [execId, JSON.stringify([{ etapa: "fila", erro: (e as Error).message }])],
      );
    } finally {
      pendentes--;
    }
  });
  cadeia = p.catch(() => undefined);
  return p;
}

export const coletasNaFila = () => pendentes;

/** Processo ainda existe nesta máquina? (sinal 0 apenas testa, não interrompe) */
function processoVivo(executor: string | null): boolean {
  if (!executor) return false;
  const [host, pid] = executor.split(":");
  if (host !== os.hostname()) return true; // outra máquina: não há como verificar — não marcar
  if (Number(pid) === process.pid) return false;
  try { process.kill(Number(pid), 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

/**
 * Na inicialização, marca como interrompidas as execuções que estavam na fila deste servidor
 * ou cujo processo executor não existe mais. Coletas rodando em outro processo (ex.: `npm run coletar`) são preservadas.
 */
export async function marcarExecucoesInterrompidas() {
  const r = await pool.query<{ id: number; executor: string | null }>(
    "SELECT id, executor FROM coleta_execucoes WHERE status IN ('na_fila', 'em_andamento')");
  const mortas = r.rows.filter((e) => !processoVivo(e.executor)).map((e) => e.id);
  if (!mortas.length) return;
  await pool.query(
    `UPDATE coleta_execucoes SET status = 'interrompida', finalizada_em = now(),
            pendencias = array_append(pendencias, 'Execução interrompida (processo encerrado); executar novamente.')
      WHERE id = ANY($1)`, [mortas]);
}

export interface NovaExecucao {
  universidade_id: number;
  modo: "busca_api" | "urls_manuais";
  urls?: string[];
  observacoes?: string | null;
}

export async function criarExecucao(d: NovaExecucao, usuarioId: number | null): Promise<{ id: number; identificador: string }> {
  const u = (await pool.query("SELECT id, sigla FROM universidades WHERE id = $1", [d.universidade_id])).rows[0];
  if (!u) throw new ErroHttp(404, "Universidade não encontrada.");
  const urls = (d.urls ?? []).map((x) => x.trim()).filter(Boolean);
  if (d.modo === "urls_manuais") {
    if (!urls.length) throw new ErroHttp(400, "Informe ao menos uma URL.");
    if (urls.length > 50) throw new ErroHttp(400, "No máximo 50 URLs por execução.");
    for (const url of urls) {
      try {
        validarUrlPublica(url);
      } catch (e) {
        throw new ErroHttp(400, `URL inválida (${url}): ${(e as Error).message}`);
      }
    }
  }
  const emCurso = await pool.query("SELECT 1 FROM coleta_execucoes WHERE universidade_id = $1 AND status IN ('na_fila', 'em_andamento')", [u.id]);
  if (emCurso.rowCount) throw new ErroHttp(409, "Já existe uma coleta em andamento para esta universidade.");
  const identificador = `COL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${(u.sigla ?? u.id).toString().toUpperCase()}-${crypto.randomBytes(3).toString("hex")}`;
  const r = await pool.query<{ id: number }>(
    `INSERT INTO coleta_execucoes (identificador, universidade_id, modo, ferramenta, urls_informadas, iniciada_por, observacoes)
     VALUES ($1,$2,$3,'pendente',$4,$5,$6) RETURNING id`,
    [identificador, u.id, d.modo, urls, usuarioId, d.observacoes ?? null],
  );
  return { id: r.rows[0].id, identificador };
}
