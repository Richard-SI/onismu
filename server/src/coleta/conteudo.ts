import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import type { RespostaFetch } from "./fetcher.js";

export interface ConteudoExtraido {
  titulo: string | null;
  texto: string;
  tipo: "html" | "pdf" | "texto";
  links: { url: string; texto: string }[];
  dataPublicacao: string | null;
}

const LIMITE_TEXTO = 400_000;

function decodificar(corpo: Buffer, contentType: string): string {
  const charset = contentType.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase();
  const bruto = corpo.toString("utf8");
  const meta = bruto.slice(0, 4000).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]?.toLowerCase();
  const enc = charset ?? meta;
  if (enc && enc !== "utf-8" && enc !== "utf8") {
    try {
      return new TextDecoder(enc).decode(corpo);
    } catch {
      /* codificação desconhecida: mantém UTF-8 */
    }
  }
  return bruto;
}

/**
 * Converte HTML/PDF em texto puro. O conteúdo é tratado estritamente como dado:
 * scripts são descartados e nada do documento é executado.
 */
export async function extrairConteudo(r: RespostaFetch): Promise<ConteudoExtraido> {
  if (r.contentType.startsWith("application/pdf")) {
    const leitura = (async () => {
      const pdf = await getDocumentProxy(new Uint8Array(r.corpo));
      return extractText(pdf, { mergePages: true });
    })();
    let timer: NodeJS.Timeout | undefined;
    const prazo = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("Tempo limite na leitura do PDF.")), 60_000); });
    const { text } = await Promise.race([leitura, prazo]).finally(() => clearTimeout(timer));
    const texto = String(text).replace(/\s+/g, " ").trim().slice(0, LIMITE_TEXTO);
    return { titulo: null, texto, tipo: "pdf", links: [], dataPublicacao: null };
  }
  const html = decodificar(r.corpo, r.contentType);
  if (r.contentType.startsWith("text/plain")) {
    return { titulo: null, texto: html.replace(/\s+/g, " ").trim().slice(0, LIMITE_TEXTO), tipo: "texto", links: [], dataPublicacao: null };
  }
  const $ = cheerio.load(html);
  const titulo = ($("meta[property='og:title']").attr("content") || $("h1").first().text() || $("title").text() || "").replace(/\s+/g, " ").trim() || null;
  const dataPublicacao =
    ($("meta[property='article:published_time']").attr("content") ||
      $("meta[name='date']").attr("content") ||
      $("time[datetime]").first().attr("datetime") ||
      "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const links: { url: string; texto: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const u = new URL(href, r.urlFinal);
      if (u.protocol === "http:" || u.protocol === "https:") links.push({ url: u.href, texto: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) });
    } catch {
      /* link inválido */
    }
  });
  $("script, style, noscript, iframe, svg, form, template").remove();
  $("nav, footer, header, aside, [role=navigation], .menu, #menu").remove();
  const principal = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  // Preserva quebras entre blocos para que trechos não se fundam.
  principal.find("p, li, h1, h2, h3, h4, h5, h6, br, div, td, tr").each((_, el) => {
    $(el).append(" \n");
  });
  const texto = principal.text().replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim().slice(0, LIMITE_TEXTO);
  return { titulo, texto, tipo: "html", links: links.slice(0, 500), dataPublicacao };
}
