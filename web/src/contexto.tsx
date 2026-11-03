import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface Usuario { id: number; email: string; nome: string; papel: "admin" | "pesquisador" }

interface Ctx {
  usuario: Usuario | null;
  sessaoCarregada: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  existeDemo: boolean;
  incluirDemo: boolean;
  setIncluirDemo: (v: boolean) => void;
}

const Contexto = createContext<Ctx | null>(null);

const lerPreferencia = () => {
  try { return localStorage.getItem("onismu:demo") === "1"; } catch { return false; }
};

export function ProvedorApp({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [sessaoCarregada, setSessaoCarregada] = useState(false);
  const [existeDemo, setExisteDemo] = useState(false);
  const [incluirDemo, setIncluir] = useState(lerPreferencia);

  useEffect(() => {
    api<{ usuario: Usuario | null }>("/api/auth/sessao").then((r) => setUsuario(r.usuario)).catch(() => {}).finally(() => setSessaoCarregada(true));
    api<{ existem_dados_demonstrativos: boolean }>("/api/publico/atualizacoes").then((r) => setExisteDemo(r.existem_dados_demonstrativos)).catch(() => {});
  }, []);

  const setIncluirDemo = useCallback((v: boolean) => {
    setIncluir(v);
    try { localStorage.setItem("onismu:demo", v ? "1" : "0"); } catch { /* armazenamento indisponível */ }
  }, []);
  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await api<{ usuario: Usuario }>("/api/auth/login", { corpo: { email, senha } });
    setUsuario(r.usuario);
  }, []);
  const sair = useCallback(async () => {
    await api("/api/auth/logout", { corpo: {} }).catch(() => {});
    setUsuario(null);
  }, []);

  return (
    <Contexto.Provider value={{ usuario, sessaoCarregada, entrar, sair, existeDemo, incluirDemo, setIncluirDemo }}>
      {children}
    </Contexto.Provider>
  );
}

export function useApp() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useApp fora do ProvedorApp");
  return c;
}

/** Parâmetro "demo" a acrescentar nas consultas públicas. */
export const useDemo = () => {
  const { incluirDemo } = useApp();
  return incluirDemo ? "true" : undefined;
};
