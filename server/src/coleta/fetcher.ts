import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net, { type LookupFunction } from "node:net";
import zlib from "node:zlib";
import { config } from "../config.js";
import { ipEhPrivadoOuReservado, validarUrlPublica } from "../lib/url.js";

export interface OpcoesFetch {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirecionamentos?: number;
  permitirRedePrivada?: boolean;
  /** Tipos de conteúdo aceitos (prefixos). */
  tipos?: string[];
}

export interface RespostaFetch {
  url: string;
  urlFinal: string;
  status: number;
  contentType: string;
  corpo: Buffer;
}

export class ErroColeta extends Error {
  constructor(public codigo: "url_invalida" | "bloqueada" | "timeout" | "tamanho" | "tipo" | "http" | "rede" | "robots", msg: string, public status?: number) {
    super(msg);
  }
}

export const USER_AGENT = () =>
  `ONISMU-Coletor/0.1 (observatorio academico de saude mental; +${config.COLETA_CONTATO})`;

const TIPOS_PADRAO = ["text/html", "application/xhtml", "application/pdf", "text/plain"];

/**
 * Lookup DNS que rejeita endereços privados/reservados no momento da conexão.
 * Validar aqui (e não antes) impede ataques de DNS rebinding.
 */
function lookupSeguro(permitirPrivada: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, enderecos) => {
      if (err) return (callback as any)(err);
      const lista = enderecos as unknown as dns.LookupAddress[];
      const bloqueado = lista.find((a) => ipEhPrivadoOuReservado(a.address));
      if (bloqueado && !permitirPrivada) {
        return (callback as any)(new ErroColeta("bloqueada", `Destino em rede privada/reservada bloqueado (${hostname}).`));
      }
      if ((options as dns.LookupOptions).all) return (callback as any)(null, lista);
      return (callback as any)(null, lista[0].address, lista[0].family);
    });
  };
}

function requisitar(url: URL, op: Required<OpcoesFetch>): Promise<RespostaFetch & { location?: string }> {
  return new Promise((resolveBruto, rejectBruto) => {
    // Prazo total (o timeout do socket só cobre inatividade) e garantia de resolução única.
    let encerrado = false;
    const prazo = setTimeout(() => {
      req.destroy();
      reject(new ErroColeta("timeout", `Tempo total de ${op.timeoutMs * 2} ms excedido.`));
    }, op.timeoutMs * 2);
    const resolve = (v: RespostaFetch & { location?: string }) => { if (!encerrado) { encerrado = true; clearTimeout(prazo); resolveBruto(v); } };
    const reject = (e: Error) => { if (!encerrado) { encerrado = true; clearTimeout(prazo); rejectBruto(e); } };
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: lookupSeguro(op.permitirRedePrivada),
        headers: {
          "User-Agent": USER_AGENT(),
          Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        timeout: op.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ url: url.href, urlFinal: url.href, status, contentType: "", corpo: Buffer.alloc(0), location: res.headers.location });
        }
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 400) {
          res.resume();
          return reject(new ErroColeta("http", `HTTP ${status}`, status));
        }
        if (!op.tipos.some((t) => contentType.startsWith(t))) {
          res.resume();
          return reject(new ErroColeta("tipo", `Tipo de conteúdo não suportado: ${contentType || "desconhecido"}`, status));
        }
        const declarado = Number(res.headers["content-length"] ?? 0);
        if (declarado > op.maxBytes) {
          res.resume();
          return reject(new ErroColeta("tamanho", `Conteúdo excede o limite de ${op.maxBytes} bytes.`, status));
        }
        res.on("error", (e: Error) => reject(new ErroColeta("rede", e.message, status)));
        res.on("aborted", () => reject(new ErroColeta("rede", "Conexão encerrada pelo servidor durante a resposta.", status)));
        res.on("close", () => { if (!res.complete) reject(new ErroColeta("rede", "Resposta incompleta.", status)); });
        const enc = String(res.headers["content-encoding"] ?? "");
        const fluxo =
          enc === "gzip" ? res.pipe(zlib.createGunzip()) :
          enc === "deflate" ? res.pipe(zlib.createInflate()) :
          enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const partes: Buffer[] = [];
        let total = 0;
        fluxo.on("data", (b: Buffer) => {
          total += b.length;
          if (total > op.maxBytes) {
            req.destroy();
            reject(new ErroColeta("tamanho", `Conteúdo excede o limite de ${op.maxBytes} bytes.`, status));
            return;
          }
          partes.push(b);
        });
        fluxo.on("end", () => resolve({ url: url.href, urlFinal: url.href, status, contentType, corpo: Buffer.concat(partes) }));
        fluxo.on("error", (e: Error) => reject(new ErroColeta("rede", e.message, status)));
      },
    );
    req.on("timeout", () => req.destroy(new ErroColeta("timeout", `Tempo limite de ${op.timeoutMs} ms excedido.`)));
    req.on("error", (e) => reject(e instanceof ErroColeta ? e : new ErroColeta(
      (e as any)?.codigo === "bloqueada" ? "bloqueada" : "rede", e.message)));
    req.end();
  });
}

/** GET seguro para conteúdo público: valida cada salto de redirecionamento. */
export async function buscarSeguro(urlEntrada: string, opcoes: OpcoesFetch = {}): Promise<RespostaFetch> {
  const op: Required<OpcoesFetch> = {
    timeoutMs: opcoes.timeoutMs ?? config.COLETA_TIMEOUT_MS,
    maxBytes: opcoes.maxBytes ?? config.COLETA_MAX_BYTES,
    maxRedirecionamentos: opcoes.maxRedirecionamentos ?? 5,
    permitirRedePrivada: opcoes.permitirRedePrivada ?? config.COLETA_PERMITIR_REDE_PRIVADA,
    tipos: opcoes.tipos ?? TIPOS_PADRAO,
  };
  let atual: URL;
  try {
    atual = validarUrlPublica(urlEntrada);
  } catch (e) {
    throw new ErroColeta("url_invalida", (e as Error).message);
  }
  for (let salto = 0; salto <= op.maxRedirecionamentos; salto++) {
    // Com IP literal o Node não consulta o DNS (o lookup seguro não é chamado): valida aqui.
    const hostIp = atual.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(hostIp) && ipEhPrivadoOuReservado(hostIp) && !op.permitirRedePrivada) {
      throw new ErroColeta("bloqueada", `Destino em rede privada/reservada bloqueado (${hostIp}).`);
    }
    const r = await requisitar(atual, op);
    if (!r.location) return { ...r, url: urlEntrada, urlFinal: atual.href };
    try {
      atual = validarUrlPublica(new URL(r.location, atual).href);
    } catch (e) {
      throw new ErroColeta("url_invalida", `Redirecionamento inválido: ${(e as Error).message}`);
    }
  }
  throw new ErroColeta("rede", "Redirecionamentos em excesso.");
}

// ---------------------------------------------------------------------------
// Respeito ao robots.txt e intervalo mínimo entre requisições ao mesmo host
// ---------------------------------------------------------------------------

const cacheRobots = new Map<string, { regras: { permitir: boolean; caminho: string }[]; em: number }>();

export function interpretarRobots(texto: string, agente = "onismu-coletor") {
  const grupos: { agentes: string[]; regras: { permitir: boolean; caminho: string }[] }[] = [];
  let atual: (typeof grupos)[number] | null = null;
  let ultimaFoiAgente = false;
  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.replace(/#.*/, "").trim();
    const m = linha.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, chave, valor] = m;
    const k = chave.toLowerCase();
    if (k === "user-agent") {
      if (!atual || !ultimaFoiAgente) {
        atual = { agentes: [], regras: [] };
        grupos.push(atual);
      }
      atual.agentes.push(valor.toLowerCase());
      ultimaFoiAgente = true;
    } else if ((k === "disallow" || k === "allow") && atual) {
      ultimaFoiAgente = false;
      if (valor) atual.regras.push({ permitir: k === "allow", caminho: valor });
    } else ultimaFoiAgente = false;
  }
  const especifico = grupos.find((g) => g.agentes.some((a) => a !== "*" && agente.toLowerCase().includes(a)));
  return (especifico ?? grupos.find((g) => g.agentes.includes("*")))?.regras ?? [];
}

export function caminhoPermitido(regras: { permitir: boolean; caminho: string }[], caminho: string): boolean {
  let melhor: { permitir: boolean; caminho: string } | null = null;
  for (const r of regras) {
    const padrao = new RegExp("^" + r.caminho.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (padrao.test(caminho) && (!melhor || r.caminho.length > melhor.caminho.length)) melhor = r;
  }
  return melhor ? melhor.permitir : true;
}

export async function permitidoPorRobots(url: string, opcoes: OpcoesFetch = {}): Promise<boolean> {
  const u = new URL(url);
  const chave = u.origin;
  let entrada = cacheRobots.get(chave);
  if (!entrada || Date.now() - entrada.em > 6 * 3600_000) {
    let regras: { permitir: boolean; caminho: string }[] = [];
    try {
      const r = await buscarSeguro(`${u.origin}/robots.txt`, { ...opcoes, tipos: ["text/", "application/octet-stream"], maxBytes: 500_000 });
      regras = interpretarRobots(r.corpo.toString("utf8"));
    } catch {
      regras = []; // robots.txt ausente ou inacessível: sem restrições declaradas
    }
    entrada = { regras, em: Date.now() };
    cacheRobots.set(chave, entrada);
  }
  return caminhoPermitido(entrada.regras, u.pathname + u.search);
}

const ultimoAcesso = new Map<string, number>();
export async function aguardarVezDoHost(url: string, intervaloMs = config.COLETA_INTERVALO_HOST_MS) {
  const host = new URL(url).host;
  const agora = Date.now();
  const proximo = (ultimoAcesso.get(host) ?? 0) + intervaloMs;
  ultimoAcesso.set(host, Math.max(agora, proximo));
  if (proximo > agora) await new Promise((r) => setTimeout(r, proximo - agora));
}
