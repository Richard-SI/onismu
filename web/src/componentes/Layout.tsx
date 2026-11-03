import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useApp } from "../contexto";

const LINKS = [
  ["/painel", "Painel nacional"], ["/mapa", "Mapa"], ["/iniciativas", "Catálogo"], ["/universidades", "Universidades"],
  ["/comparar", "Comparador"], ["/tematica", "Comparação temática"], ["/metodologia", "Metodologia"],
] as const;

function Simbolo() {
  return (
    <svg className="marca-simbolo" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--marca)" />
      <path d="M8 18c3.5-7 12.5-7 16 0" stroke="var(--sobre-marca)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="20.5" r="2.6" fill="var(--sobre-marca)" />
    </svg>
  );
}

function AlternarTema() {
  const [tema, setTema] = useState<string | null>(() => { try { return localStorage.getItem("onismu:tema"); } catch { return null; } });
  useEffect(() => {
    if (tema) document.documentElement.dataset.theme = tema; else delete document.documentElement.dataset.theme;
    try { if (tema) localStorage.setItem("onismu:tema", tema); else localStorage.removeItem("onismu:tema"); } catch { /* indisponível */ }
  }, [tema]);
  const proximo = tema === null ? "dark" : tema === "dark" ? "light" : null;
  const nome = tema === null ? "automático" : tema === "dark" ? "escuro" : "claro";
  return (
    <button type="button" className="botao botao-sec botao-peq" onClick={() => setTema(proximo)} title="Alternar tema (automático → escuro → claro)">
      Tema: {nome}
    </button>
  );
}

export function Layout() {
  const { usuario, existeDemo, incluirDemo, setIncluirDemo } = useApp();
  const local = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [local.pathname]);
  return (
    <>
      <a className="pular" href="#principal">Pular para o conteúdo</a>
      {incluirDemo && existeDemo && <div className="faixa-demo" role="status">Exibindo também DADOS DEMONSTRATIVOS (fictícios), marcados em todas as telas.</div>}
      <header className="topo">
        <div className="topo-interno">
          <Link to="/" className="marca" aria-label="ONISMU — página inicial">
            <Simbolo />
            <span><strong>ONISMU</strong><span>Observatório Nacional de Iniciativas de Saúde Mental nas Universidades Brasileiras</span></span>
          </Link>
          <nav className="nav" aria-label="Navegação principal">
            {LINKS.map(([to, t]) => <NavLink key={to} to={to}>{t}</NavLink>)}
            {usuario && <NavLink to="/admin/validacao" className={({ isActive }) => (isActive ? "active nav-validacao" : "nav-validacao")}>Validação</NavLink>}
          </nav>
        </div>
      </header>
      <main id="principal" className="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="rodape">
        <div>
          <div style={{ maxWidth: 640 }}>
            <strong>ONISMU</strong> — ferramenta de investigação e transparência institucional. Não é um ranking de qualidade dos serviços.
            Os dados publicados foram validados por pesquisadores a partir de fontes públicas citadas em cada registro.
            <div style={{ marginTop: 8 }}>
              <Link to="/metodologia#reportar">Reportar erro ou omissão</Link> · <Link to="/metodologia">Metodologia</Link> ·{" "}
              <a href="/api/publico/relatorio.pdf">Relatório (PDF)</a>
            </div>
            <div className="muito-discreto" style={{ marginTop: 8 }}>
              Precisa de ajuda agora? CVV — Centro de Valorização da Vida: ligue 188 (gratuito, 24 h) ou acesse cvv.org.br. Em emergência, SAMU 192.
            </div>
          </div>
          <div className="pilha" style={{ minWidth: 220 }}>
            <AlternarTema />
            {existeDemo && (
              <label className="linha" style={{ fontWeight: 400 }}>
                <input type="checkbox" checked={incluirDemo} onChange={(e) => setIncluirDemo(e.target.checked)} /> Incluir dados demonstrativos
              </label>
            )}
            <Link to="/admin">{usuario ? `Área administrativa (${usuario.nome})` : "Acesso da equipe"}</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
