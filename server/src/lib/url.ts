import net from "node:net";
import { config } from "../config.js";

const PARAMS_RASTREIO = /^(utm_|fbclid$|gclid$|mc_|_ga$|ref$|ref_src$)/i;

/**
 * Valida URL pública http(s). Retorna o objeto URL ou lança erro com mensagem amigável.
 * Portas diferentes de 80/443 só são aceitas no modo de testes (COLETA_PERMITIR_REDE_PRIVADA).
 */
export function validarUrlPublica(entrada: string, qualquerPorta = config.COLETA_PERMITIR_REDE_PRIVADA): URL {
  let u: URL;
  try {
    u = new URL(entrada.trim());
  } catch {
    throw new Error("URL inválida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Somente URLs http(s) são aceitas.");
  if (u.username || u.password) throw new Error("URLs com credenciais embutidas não são aceitas.");
  if (!u.hostname || u.hostname.length > 253) throw new Error("Host inválido.");
  if (!qualquerPorta && u.port && u.port !== "80" && u.port !== "443") throw new Error("Somente as portas 80 e 443 são aceitas.");
  return u;
}

/**
 * Normaliza uma URL para deduplicação: minúsculas no host, sem "www.", sem fragmento,
 * sem parâmetros de rastreamento, parâmetros ordenados, sem barra final redundante.
 * O esquema é unificado (http/https) porque o mesmo conteúdo costuma estar nos dois.
 */
export function normalizarUrl(entrada: string): string {
  const u = validarUrlPublica(entrada);
  const host = u.hostname.toLowerCase().replace(/^www\./, "") + (u.port ? `:${u.port}` : "");
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !PARAMS_RASTREIO.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  let caminho = u.pathname.replace(/\/{2,}/g, "/");
  try {
    caminho = encodeURI(decodeURI(caminho));
  } catch {
    /* mantém caminho original se a decodificação falhar */
  }
  if (caminho.length > 1) caminho = caminho.replace(/\/+$/, "");
  if (/\/index\.(html?|php)$/i.test(caminho)) caminho = caminho.replace(/\/index\.(html?|php)$/i, "") || "/";
  const qs = params.length ? "?" + new URLSearchParams(params).toString() : "";
  return `${host}${caminho === "/" ? "" : caminho}${qs}`;
}

export function dominioDe(entrada: string): string | null {
  try {
    return new URL(entrada).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Verifica se o host pertence ao domínio institucional (inclui subdomínios). */
export function pertenceAoDominio(urlOuHost: string, dominio: string | null | undefined): boolean {
  if (!dominio) return false;
  const host = (dominioDe(urlOuHost) ?? urlOuHost).toLowerCase();
  const d = dominio.toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith("." + d);
}

/** Endereços que nunca devem ser acessados pelo coletor (proteção contra SSRF). */
export function ipEhPrivadoOuReservado(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||           // link-local / metadados de nuvem
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224                               // multicast e reservados
    );
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapeado = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ipEhPrivadoOuReservado(mapeado[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
  }
  return true; // formato desconhecido: bloqueia
}
