import { useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { api, ErroApi, useApi } from "../../api";
import { Estado, Indicador, useTitulo } from "../../componentes/base";
import { useApp } from "../../contexto";
import { SITUACOES_PESQUISA, fmtNum } from "../../rotulos";

export function Login() {
  useTitulo("Acesso da equipe");
  const { usuario, entrar } = useApp();
  const local = useLocation() as any;
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (usuario) return <Navigate to={local.state?.de ?? "/admin"} replace />;
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true); setErro("");
    try { await entrar(String(f.get("email")), String(f.get("senha"))); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : "Falha de conexão."); }
    finally { setEnviando(false); }
  };
  return (
    <form className="cartao" style={{ maxWidth: 420, margin: "32px auto" }} onSubmit={enviar}>
      <h1>Acesso da equipe</h1>
      <p className="discreto">Área restrita à gestão da coleta, revisão de evidências e edição de registros. A consulta pública não exige login.</p>
      <div className="campo"><label htmlFor="l-email">E-mail</label><input id="l-email" name="email" type="email" autoComplete="username" required /></div>
      <div className="campo"><label htmlFor="l-senha">Senha</label><input id="l-senha" name="senha" type="password" autoComplete="current-password" required /></div>
      {erro && <div className="erro" role="alert" style={{ marginBottom: 12 }}>{erro}</div>}
      <button className="botao" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

const MENU: [string, string, string?][] = [
  ["/admin", "Visão geral"], ["/admin/validacao", "Validação", "candidatos_pendentes"], ["/admin/revisao", "Fila de revisão (lista)"], ["/admin/coleta", "Coleta"],
  ["/admin/universidades", "Universidades"], ["/admin/iniciativas", "Iniciativas"], ["/admin/documentos", "Documentos e fontes"],
  ["/admin/duplicidades", "Duplicidades", "duplicidades_pendentes"], ["/admin/historico", "Histórico"], ["/admin/relatos", "Relatos de erro", "relatos_novos"],
  ["/admin/tarefas", "Tarefas de atualização"], ["/admin/exportar", "Exportação"], ["/admin/usuarios", "Usuários"],
];

export function AdminLayout() {
  const { usuario, sessaoCarregada, sair } = useApp();
  const local = useLocation();
  const { dados: resumo } = useApi<any>(usuario ? `/api/admin/resumo?t=${local.pathname}` : null);
  if (!sessaoCarregada) return <p className="discreto">Verificando sessão…</p>;
  if (!usuario) return <Navigate to="/admin/entrar" state={{ de: local.pathname }} replace />;
  return (
    <div className="admin-layout">
      <nav className="admin-menu" aria-label="Administração">
        {MENU.filter(([to]) => to !== "/admin/usuarios" || usuario.papel === "admin").map(([to, t, c]) => (
          <NavLink key={to} to={to} end={to === "/admin"}>{t}{c && resumo?.[c] > 0 && <span className="contador">{resumo[c]}</span>}</NavLink>
        ))}
        <div className="muito-discreto" style={{ padding: "12px 10px 0" }}>{usuario.nome} · {usuario.papel}</div>
        <button className="botao botao-sec botao-peq" style={{ margin: "6px 10px" }} onClick={sair}>Sair</button>
      </nav>
      <div><Outlet /></div>
    </div>
  );
}

export function AdminPainel() {
  useTitulo("Administração");
  const { dados: r, erro } = useApi<any>("/api/admin/resumo");
  return (
    <div className="pilha">
      <h1>Administração</h1>
      <Estado erro={erro} carregando={!r}>
        {r && (
          <>
            <div className="grade grade-4">
              <Link to="/admin/validacao" style={{ textDecoration: "none", color: "inherit" }}><Indicador rotulo="Candidatos aguardando validação" valor={fmtNum(r.candidatos_pendentes)} base="abrir a aba Validação →" /></Link>
              <Indicador rotulo="Coletas em andamento" valor={fmtNum(r.coletas_em_andamento)} />
              <Link to="/admin/duplicidades" style={{ textDecoration: "none", color: "inherit" }}><Indicador rotulo="Possíveis duplicidades" valor={fmtNum(r.duplicidades_pendentes)} /></Link>
              <Link to="/admin/relatos" style={{ textDecoration: "none", color: "inherit" }}><Indicador rotulo="Relatos de erro novos" valor={fmtNum(r.relatos_novos)} /></Link>
            </div>
            <div className="cartao">
              <h2>Matriz de cobertura (dados reais)</h2>
              <table><tbody>
                {Object.entries(SITUACOES_PESQUISA).map(([k, v]) => (
                  <tr key={k}><td><Link to={`/admin/universidades?situacao_pesquisa=${k}`}>{v}</Link></td>
                    <td className="num">{fmtNum(r.situacoes.find((s: any) => s.situacao_pesquisa === k)?.n ?? 0)}</td></tr>
                ))}
              </tbody></table>
            </div>
            {r.universidades_demo > 0 && <div className="aviso">Há {r.universidades_demo} universidades demonstrativas (fictícias) na base. Remova com <code>npm run remover:demo -w server</code>.</div>}
          </>
        )}
      </Estado>
    </div>
  );
}

/** Botão que executa uma ação administrativa e mostra o resultado. */
export function useAcao() {
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: ReactNode } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const executar = async (fn: () => Promise<unknown>, sucesso: ReactNode) => {
    setOcupado(true); setMsg(null);
    try { await fn(); setMsg({ tipo: "ok", texto: sucesso }); return true; }
    catch (e) {
      const x = e as ErroApi;
      setMsg({ tipo: "erro", texto: <>{x.message}{x.detalhes?.length ? <ul>{x.detalhes.map((d) => <li key={d.campo + d.mensagem}>{d.campo}: {d.mensagem}</li>)}</ul> : null}</> });
      return false;
    } finally { setOcupado(false); }
  };
  const Mensagem = () => (msg ? <div className={msg.tipo === "ok" ? "sucesso" : "erro"} role={msg.tipo === "ok" ? "status" : "alert"}>{msg.texto}</div> : null);
  return { executar, ocupado, Mensagem, setMsg };
}

export { api };
