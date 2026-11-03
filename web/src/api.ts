import { useCallback, useEffect, useRef, useState } from "react";

export class ErroApi extends Error {
  constructor(public status: number, message: string, public detalhes?: { campo: string; mensagem: string }[]) {
    super(message);
  }
}

/** Monta query string ignorando vazios; listas viram "a,b,c". */
export function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function api<T = any>(url: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const metodo = opcoes.metodo ?? (opcoes.corpo !== undefined ? "POST" : "GET");
  const r = await fetch(url, {
    method: metodo,
    credentials: "same-origin",
    headers: {
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      // Cabeçalho exigido pelo servidor em operações administrativas (proteção anti-CSRF).
      ...(metodo !== "GET" ? { "x-onismu-requisicao": "1" } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
  });
  const tipo = r.headers.get("content-type") ?? "";
  const corpo = tipo.includes("application/json") ? await r.json() : await r.text();
  if (!r.ok) throw new ErroApi(r.status, (corpo as any)?.erro ?? `Erro ${r.status}`, (corpo as any)?.detalhes);
  return corpo as T;
}

/** Busca dados e mantém o último resultado visível durante recargas (sem "piscar"). */
export function useApi<T = any>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [carregando, setCarregando] = useState(false);
  const versao = useRef(0);
  const carregar = useCallback(async () => {
    if (!url) return;
    const v = ++versao.current;
    setCarregando(true);
    try {
      const d = await api<T>(url);
      if (v === versao.current) { setDados(d); setErro(null); }
    } catch (e) {
      if (v === versao.current) setErro(e instanceof ErroApi ? e : new ErroApi(0, "Falha de conexão com o servidor."));
    } finally {
      if (v === versao.current) setCarregando(false);
    }
  }, [url]);
  useEffect(() => { void carregar(); }, [carregar]);
  return { dados, erro, carregando, recarregar: carregar };
}
