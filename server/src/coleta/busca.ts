import { config } from "../config.js";
import { ErroColeta } from "./fetcher.js";

export interface ResultadoBusca {
  url: string;
  titulo: string;
  trecho: string;
  consulta: string;
}

export interface ProvedorBusca {
  nome: string;
  buscar(consulta: string, opcoes: { pagina: number; porPagina: number }): Promise<Omit<ResultadoBusca, "consulta">[]>;
}

/** Termos-base da estratégia de busca (protocolo de pesquisa, seção "Estratégia de busca"). */
export const TERMOS_BASE = [
  '"saúde mental"',
  '"política de saúde mental"',
  '"atenção psicossocial"',
  '"projeto de extensão" "saúde mental"',
  '"acolhimento psicológico"',
  '"serviço de psicologia"',
  '"assistência estudantil" "saúde mental"',
  '"promoção da saúde mental"',
  '"sofrimento psíquico" estudantes',
  '"programa institucional" "saúde mental"',
  '"prevenção do suicídio"',
  'resolução "saúde mental"',
];

export interface UniversidadeBusca {
  nome_oficial: string;
  sigla: string | null;
  dominio: string | null;
}

/** Gera consultas combinando instituição × termos; usa restrição de domínio e busca de PDFs quando possível. */
export function gerarConsultas(u: UniversidadeBusca): string[] {
  const consultas: string[] = [];
  const nome = `"${u.nome_oficial}"`;
  for (const termo of TERMOS_BASE) {
    if (u.dominio) consultas.push(`site:${u.dominio} ${termo}`);
    else consultas.push(`${nome} ${termo}`);
  }
  if (u.dominio) {
    consultas.push(`site:${u.dominio} filetype:pdf "saúde mental" resolução`);
    consultas.push(`site:${u.dominio} filetype:pdf "saúde mental" política`);
  }
  // Busca aberta (fontes secundárias e domínios alternativos), só para descoberta.
  consultas.push(`${u.sigla ? `"${u.sigla}" ` : ""}${nome} "saúde mental" estudantes`);
  return [...new Set(consultas)];
}

class BraveSearch implements ProvedorBusca {
  nome = "brave-search-api";
  constructor(private chave: string) {}
  async buscar(consulta: string, { pagina, porPagina }: { pagina: number; porPagina: number }) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", consulta);
    url.searchParams.set("count", String(Math.min(porPagina, 20)));
    url.searchParams.set("offset", String(pagina));
    url.searchParams.set("country", "BR");
    url.searchParams.set("search_lang", "pt-br");
    const r = await fetch(url, {
      headers: { Accept: "application/json", "X-Subscription-Token": this.chave },
      signal: AbortSignal.timeout(config.COLETA_TIMEOUT_MS),
    });
    if (!r.ok) throw new ErroColeta("http", `Brave Search respondeu HTTP ${r.status}`, r.status);
    const j: any = await r.json();
    return ((j?.web?.results ?? []) as any[]).map((x) => ({
      url: String(x.url),
      titulo: String(x.title ?? "").replace(/<[^>]+>/g, ""),
      trecho: String(x.description ?? "").replace(/<[^>]+>/g, ""),
    }));
  }
}

/**
 * SearXNG: metabuscador de código aberto executado localmente (Docker), sem chave nem custo.
 * Consulta motores públicos (ex.: DuckDuckGo, Bing, Mojeek) em nome do observatório.
 */
export class SearxngSearch implements ProvedorBusca {
  nome = "searxng-local";
  constructor(private base = config.SEARXNG_URL) {}
  async buscar(consulta: string, { pagina }: { pagina: number; porPagina: number }) {
    const url = new URL("/search", this.base);
    url.searchParams.set("q", consulta);
    url.searchParams.set("format", "json");
    url.searchParams.set("pageno", String(pagina + 1));
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("safesearch", "0");
    let r: Response;
    try {
      r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(config.COLETA_TIMEOUT_MS * 2) });
    } catch (e) {
      throw new ErroColeta("rede", `SearXNG indisponível em ${this.base} (${(e as Error).message}). Suba com: docker compose up -d searxng`);
    }
    if (!r.ok) throw new ErroColeta("http", `SearXNG respondeu HTTP ${r.status}${r.status === 403 ? " (formato JSON desabilitado?)" : ""}`, r.status);
    const j: any = await r.json();
    const motoresComFalha = (j?.unresponsive_engines ?? []).map((m: any) => (Array.isArray(m) ? m.join(": ") : String(m)));
    const resultados = ((j?.results ?? []) as any[]).map((x) => ({
      url: String(x.url),
      titulo: String(x.title ?? ""),
      trecho: String(x.content ?? ""),
    }));
    if (!resultados.length && motoresComFalha.length) {
      throw new ErroColeta("http", `Nenhum resultado; motores sem resposta: ${motoresComFalha.join("; ")}`);
    }
    return resultados;
  }
}

/** Retorna o provedor configurado, ou null quando nenhum está disponível (coleta só por URLs informadas). */
export function provedorConfigurado(): ProvedorBusca | null {
  if (config.BUSCA_PROVEDOR === "brave" && config.BRAVE_API_KEY) return new BraveSearch(config.BRAVE_API_KEY);
  if (config.BUSCA_PROVEDOR === "searxng") return new SearxngSearch();
  return null;
}

export function statusBusca() {
  if (config.BUSCA_PROVEDOR === "brave" && !config.BRAVE_API_KEY)
    return { disponivel: false, provedor: "brave", motivo: "BUSCA_PROVEDOR=brave, mas BRAVE_API_KEY não está definida." };
  if (config.BUSCA_PROVEDOR === "nenhum")
    return { disponivel: false, provedor: "nenhum", motivo: "Nenhum provedor de busca configurado; use a coleta por URLs informadas." };
  return { disponivel: true, provedor: config.BUSCA_PROVEDOR, motivo: null };
}

/** Confere se o provedor configurado responde de fato (usado no diagnóstico e na tela de coleta). */
export async function testarBusca(): Promise<{ ok: boolean; detalhe: string }> {
  const st = statusBusca();
  if (!st.disponivel) return { ok: false, detalhe: st.motivo! };
  try {
    const rs = await provedorConfigurado()!.buscar('"saúde mental" universidade', { pagina: 0, porPagina: 5 });
    return { ok: rs.length > 0, detalhe: rs.length ? `${rs.length} resultados (ex.: ${rs[0].url})` : "Provedor respondeu sem resultados." };
  } catch (e) {
    return { ok: false, detalhe: (e as Error).message };
  }
}
