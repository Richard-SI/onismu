import { pool } from "../db.js";
import { trechoPresente } from "../lib/texto.js";
import { extrairConteudo } from "./conteudo.js";
import { aguardarVezDoHost, buscarSeguro, permitidoPorRobots } from "./fetcher.js";

/**
 * Baixa novamente a fonte de um candidato e confere se o trecho de evidência aparece literalmente.
 * Útil para candidatos importados (ex.: pesquisa-piloto) cujo trecho não foi conferido pelo sistema.
 */
export async function verificarTrechoCandidato(candidatoId: number): Promise<{ resultado: string; detalhe: string }> {
  const c = (await pool.query("SELECT id, url_fonte, trecho_evidencia FROM candidatos WHERE id = $1", [candidatoId])).rows[0];
  if (!c) throw new Error("Candidato não encontrado.");
  let resultado: string;
  let detalhe: string;
  try {
    if (!(await permitidoPorRobots(c.url_fonte))) {
      resultado = "erro_acesso";
      detalhe = "Acesso não permitido pelo robots.txt; conferir manualmente.";
    } else {
      await aguardarVezDoHost(c.url_fonte);
      // Documentos normativos em PDF podem ser grandes: limite ampliado só para esta conferência.
      const r = await buscarSeguro(c.url_fonte, { maxBytes: 30_000_000, timeoutMs: 30_000 });
      const conteudo = await extrairConteudo(r);
      // Para HTML, confere também o texto bruto (inclui menus/rodapés removidos na extração principal).
      const bruto = r.contentType.includes("html") ? r.corpo.toString("utf8").replace(/<[^>]+>/g, " ") : "";
      const ok = trechoPresente(c.trecho_evidencia, conteudo.texto) || (bruto && trechoPresente(c.trecho_evidencia, decodeEntidades(bruto)));
      resultado = ok ? "confirmado" : "nao_localizado";
      detalhe = ok
        ? `Trecho localizado na fonte (HTTP ${r.status}).`
        : `Fonte acessada (HTTP ${r.status}, ${conteudo.tipo}), mas o trecho não foi localizado literalmente.`;
    }
  } catch (e) {
    resultado = "erro_acesso";
    detalhe = `Falha ao acessar a fonte: ${(e as Error).message}`;
  }
  detalhe = `${detalhe} [verificado em ${new Date().toISOString()}]`;
  await pool.query("UPDATE candidatos SET verificacao_trecho = $2, verificacao_detalhe = $3 WHERE id = $1", [candidatoId, resultado, detalhe]);
  return { resultado, detalhe };
}

function decodeEntidades(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, nome) => ENTIDADES[nome.toLowerCase()] ?? m);
}

const ENTIDADES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç",
  acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à", ordm: "º", ordf: "ª", ndash: "–", mdash: "—",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…",
};
