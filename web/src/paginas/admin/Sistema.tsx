import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, qs, useApi } from "../../api";
import { Estado, Paginacao, useTitulo } from "../../componentes/base";
import { useApp } from "../../contexto";
import { REGIOES, SITUACOES_PESQUISA, fmtData } from "../../rotulos";
import { useAcao } from "./AdminBase";

export function Duplicidades() {
  useTitulo("Duplicidades");
  const [status, setStatus] = useState("pendente");
  const { dados, erro, recarregar } = useApi<any>(`/api/admin/duplicidades?status=${status}`);
  const { executar, ocupado, Mensagem } = useAcao();
  const resolver = async (d: any, acao: "confirmar" | "descartar", manter?: number) => {
    const justificativa = window.prompt(acao === "confirmar" ? "Justificativa (a outra iniciativa será arquivada, nunca excluída):" : "Por que não são duplicatas?");
    if (!justificativa) return;
    if (await executar(() => api(`/api/admin/duplicidades/${d.id}/resolver`, { corpo: { acao, manter_id: manter, justificativa } }), "Par revisado.")) void recarregar();
  };
  return (
    <div className="pilha">
      <h1>Controle de duplicidades</h1>
      <p className="discreto">Pares semelhantes na mesma universidade (nome parecido ou mesma fonte). Nada é excluído automaticamente.</p>
      <div className="abas" role="tablist">{["pendente", "confirmada", "descartada"].map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <Mensagem />
      <Estado erro={erro} carregando={!dados} vazio={dados?.itens.length === 0}>
        {dados && <div className="tabela-rolagem"><table>
          <thead><tr><th>Univ.</th><th>Iniciativa A</th><th>Iniciativa B</th><th className="num">Similaridade</th><th>Motivo</th>{status === "pendente" && <th>Ação</th>}</tr></thead>
          <tbody>{dados.itens.map((d: any) => (
            <tr key={d.id}><td>{d.sigla}</td>
              <td><Link to={`/admin/iniciativas/${d.iniciativa_a}`}>{d.nome_a}</Link><div className="muito-discreto">#{d.iniciativa_a} · {d.status_a}</div></td>
              <td><Link to={`/admin/iniciativas/${d.iniciativa_b}`}>{d.nome_b}</Link><div className="muito-discreto">#{d.iniciativa_b} · {d.status_b}</div></td>
              <td className="num">{d.similaridade.toFixed(2)}</td><td>{d.motivo}</td>
              {status === "pendente" && <td><div className="pilha" style={{ gap: 4 }}>
                <button className="botao botao-sec botao-peq" disabled={ocupado} onClick={() => resolver(d, "confirmar", d.iniciativa_a)}>Manter A</button>
                <button className="botao botao-sec botao-peq" disabled={ocupado} onClick={() => resolver(d, "confirmar", d.iniciativa_b)}>Manter B</button>
                <button className="botao botao-sec botao-peq" disabled={ocupado} onClick={() => resolver(d, "descartar")}>Não são duplicatas</button></div></td>}
            </tr>))}</tbody>
        </table></div>}
      </Estado>
    </div>
  );
}

export function Historico() {
  useTitulo("Histórico de alterações");
  const [sp, setSp] = useSearchParams();
  const pagina = Number(sp.get("pagina") ?? 1);
  const { dados, erro } = useApi<any>(`/api/admin/historico${qs({ entidade: sp.get("entidade"), registro_id: sp.get("registro_id"), pagina, por_pagina: 50 })}`);
  const definir = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "pagina") n.delete("pagina"); setSp(n, { replace: true }); };
  return (
    <div className="pilha">
      <h1>Histórico de alterações</h1>
      <div className="cartao campos">
        <div><label htmlFor="h-ent">Entidade</label><select id="h-ent" value={sp.get("entidade") ?? ""} onChange={(e) => definir("entidade", e.target.value || null)}>
          <option value="">Todas</option>{["universidades", "iniciativas", "candidatos", "documentos", "fontes", "campi", "usuarios", "tarefas_atualizacao", "relatos_erro"].map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label htmlFor="h-id">ID do registro</label><input id="h-id" type="number" defaultValue={sp.get("registro_id") ?? ""} onBlur={(e) => definir("registro_id", e.target.value || null)} /></div>
      </div>
      <Estado erro={erro} carregando={!dados} vazio={dados?.total === 0}>
        {dados && <>
          <div className="tabela-rolagem"><table>
            <thead><tr><th>Data</th><th>Registro</th><th>Campo</th><th>Valor anterior</th><th>Valor novo</th><th>Responsável</th><th>Justificativa</th></tr></thead>
            <tbody>{dados.itens.map((h: any) => (
              <tr key={h.id}><td>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td><td>{h.entidade} #{h.registro_id}</td><td>{h.campo}</td>
                <td className="muito-discreto" style={{ maxWidth: 240, wordBreak: "break-word" }}>{h.valor_anterior}</td><td style={{ maxWidth: 240, wordBreak: "break-word" }}>{h.valor_novo}</td>
                <td>{h.responsavel ?? "sistema/importação"}</td><td>{h.justificativa}</td></tr>))}</tbody>
          </table></div>
          <Paginacao pagina={dados.pagina} totalPaginas={dados.total_paginas} total={dados.total} aoMudar={(p) => definir("pagina", String(p))} />
        </>}
      </Estado>
    </div>
  );
}

export function Relatos() {
  useTitulo("Relatos de erro");
  const { dados, erro, recarregar } = useApi<any>("/api/admin/relatos");
  const { executar, Mensagem } = useAcao();
  return (
    <div className="pilha">
      <h1>Relatos de erro recebidos</h1>
      <Mensagem />
      <Estado erro={erro} carregando={!dados} vazio={dados?.itens.length === 0}>
        {dados && <div className="tabela-rolagem"><table>
          <thead><tr><th>Data</th><th>Registro</th><th>Descrição</th><th>Fonte indicada</th><th>Contato</th><th>Status</th></tr></thead>
          <tbody>{dados.itens.map((r: any) => (
            <tr key={r.id}><td>{fmtData(r.created_at)}</td>
              <td>{r.tipo_registro === "iniciativa" ? <Link to={`/admin/iniciativas/${r.registro_id}`}>iniciativa #{r.registro_id}</Link> : r.tipo_registro === "universidade" ? <Link to={`/admin/universidades/${r.registro_id}`}>universidade #{r.registro_id}</Link> : "geral"}</td>
              <td style={{ maxWidth: 380 }}>{r.descricao}</td><td style={{ wordBreak: "break-all" }}>{r.url_referencia ? <a href={r.url_referencia} target="_blank" rel="noopener noreferrer">{r.url_referencia}</a> : "—"}</td>
              <td>{r.contato ?? "—"}</td>
              <td><select aria-label="Status do relato" value={r.status} onChange={async (e) => { if (await executar(() => api(`/api/admin/relatos/${r.id}/status`, { corpo: { status: e.target.value } }), "Status atualizado.")) void recarregar(); }}>
                <option value="novo">Novo</option><option value="em_analise">Em análise</option><option value="resolvido">Resolvido</option><option value="descartado">Descartado</option></select></td></tr>))}</tbody>
        </table></div>}
      </Estado>
    </div>
  );
}

export function Tarefas() {
  useTitulo("Tarefas de atualização");
  const { usuario } = useApp();
  const { dados, recarregar } = useApi<any>("/api/admin/tarefas");
  const { executar, ocupado, Mensagem } = useAcao();
  const criar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const corpo = {
      nome: String(f.get("nome")), periodicidade_dias: Number(f.get("periodicidade")), limite_por_execucao: Number(f.get("limite")), ativa: true,
      escopo: { regioes: f.getAll("regioes").map(String), estados: String(f.get("estados") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
        universidade_ids: [], somente_situacoes: f.getAll("situacoes").map(String) },
    };
    if (await executar(() => api("/api/admin/tarefas", { corpo }), "Tarefa criada.")) { form.reset(); void recarregar(); }
  };
  const alternar = async (t: any) => {
    if (await executar(() => api(`/api/admin/tarefas/${t.id}`, { metodo: "PUT", corpo: { ...t, ativa: !t.ativa } }), "Tarefa atualizada.")) void recarregar();
  };
  return (
    <div className="pilha">
      <h1>Tarefas de atualização</h1>
      <p className="discreto">Tarefas recorrentes executadas por <code>npm run coleta:agendada -w server</code> (agende no cron). Exigem provedor de busca configurado; sem ele, a execução é recusada e registrada — nunca simulada.</p>
      <Mensagem />
      <div className="tabela-rolagem"><table>
        <thead><tr><th>Tarefa</th><th>Escopo</th><th>Periodicidade</th><th>Limite</th><th>Última</th><th>Próxima</th><th>Ativa</th></tr></thead>
        <tbody>{(dados?.itens ?? []).map((t: any) => (
          <tr key={t.id}><td>{t.nome}</td><td className="muito-discreto">{JSON.stringify(t.escopo)}</td><td>{t.periodicidade_dias} dias</td><td>{t.limite_por_execucao}</td>
            <td>{fmtData(t.ultima_execucao)}</td><td>{fmtData(t.proxima_execucao)}</td>
            <td><button className="botao botao-sec botao-peq" disabled={usuario?.papel !== "admin" || ocupado} onClick={() => alternar(t)}>{t.ativa ? "Ativa — pausar" : "Pausada — ativar"}</button></td></tr>))}</tbody>
      </table></div>
      {usuario?.papel === "admin" ? (
        <form className="cartao" onSubmit={criar}>
          <h2>Nova tarefa</h2>
          <div className="campos">
            <div className="campo"><label htmlFor="t-n">Nome</label><input id="t-n" name="nome" type="text" required /></div>
            <div className="campo"><label htmlFor="t-p">Periodicidade (dias)</label><input id="t-p" name="periodicidade" type="number" min={1} defaultValue={90} required /></div>
            <div className="campo"><label htmlFor="t-l">Universidades por execução</label><input id="t-l" name="limite" type="number" min={1} max={500} defaultValue={10} required /></div>
            <div className="campo"><label htmlFor="t-e">UFs (separadas por vírgula)</label><input id="t-e" name="estados" type="text" placeholder="RS, SC" /></div>
          </div>
          <fieldset className="campo"><legend>Regiões</legend>{REGIOES.map((r) => <label key={r} className="linha" style={{ fontWeight: 400 }}><input type="checkbox" name="regioes" value={r} /> {r}</label>)}</fieldset>
          <fieldset className="campo"><legend>Somente universidades nas situações</legend>{Object.entries(SITUACOES_PESQUISA).map(([k, v]) => <label key={k} className="linha" style={{ fontWeight: 400 }}><input type="checkbox" name="situacoes" value={k} /> {v}</label>)}</fieldset>
          <button className="botao" disabled={ocupado}>Criar tarefa</button>
        </form>
      ) : <p className="muito-discreto">Somente administradores criam ou alteram tarefas.</p>}
    </div>
  );
}

export function Exportar() {
  useTitulo("Exportação");
  const tipos = ["universidades", "iniciativas", "politicas", "extensao", "documentos", "fontes", "indicadores"];
  return (
    <div className="pilha">
      <h1>Exportação</h1>
      <section className="cartao">
        <h2>Base completa (administrativa)</h2>
        <p className="discreto">Inclui registros não validados, candidatos, execuções de coleta e histórico. Não inclui usuários nem senhas. Uso interno.</p>
        <a className="botao" href="/api/admin/exportar/base-completa.xlsx">Baixar base completa (Excel)</a>
      </section>
      <section className="cartao">
        <h2>Conjuntos públicos (somente validados)</h2>
        <ul>{tipos.map((t) => <li key={t}>{t}: <a href={`/api/publico/exportar/${t}.csv`}>CSV</a> · <a href={`/api/publico/exportar/${t}.xlsx`}>Excel</a></li>)}</ul>
        <p><a href="/api/publico/relatorio.pdf">Relatório em PDF</a></p>
      </section>
      <section className="cartao">
        <h2>Backup do banco</h2>
        <p>Execute <code>npm run backup -w server</code> no servidor (gera <code>backups/onismu_*.dump</code>; restauração com <code>pg_restore</code>). Ver docs/IMPLANTACAO.md.</p>
      </section>
    </div>
  );
}

export function Usuarios() {
  useTitulo("Usuários");
  const { usuario } = useApp();
  const { dados, erro, recarregar } = useApi<any>("/api/admin/usuarios");
  const { executar, ocupado, Mensagem } = useAcao();
  const criar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    if (await executar(() => api("/api/admin/usuarios", { corpo: f }), "Usuário criado.")) { form.reset(); void recarregar(); }
  };
  return (
    <div className="pilha">
      <h1>Usuários administrativos</h1>
      <Mensagem />
      <Estado erro={erro} carregando={!dados}>
        {dados && <div className="tabela-rolagem"><table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th>Situação</th></tr></thead>
          <tbody>{dados.itens.map((u: any) => <tr key={u.id}><td>{u.nome}</td><td>{u.email}</td><td>{u.papel}</td><td>{fmtData(u.ultimo_login)}</td>
            <td><button className="botao botao-sec botao-peq" disabled={u.id === usuario?.id || ocupado} onClick={async () => { if (await executar(() => api(`/api/admin/usuarios/${u.id}/ativo`, { corpo: { ativo: !u.ativo } }), "Atualizado.")) void recarregar(); }}>{u.ativo ? "Ativo — desativar" : "Inativo — reativar"}</button></td></tr>)}</tbody>
        </table></div>}
      </Estado>
      <form className="cartao" onSubmit={criar}>
        <h2>Novo usuário</h2>
        <div className="campos">
          <div className="campo"><label htmlFor="nu-n">Nome</label><input id="nu-n" name="nome" type="text" required /></div>
          <div className="campo"><label htmlFor="nu-e">E-mail</label><input id="nu-e" name="email" type="email" required /></div>
          <div className="campo"><label htmlFor="nu-p">Papel</label><select id="nu-p" name="papel"><option value="pesquisador">Pesquisador(a)</option><option value="admin">Administrador(a)</option></select></div>
          <div className="campo"><label htmlFor="nu-s">Senha inicial (≥ 12, letras e números)</label><input id="nu-s" name="senha" type="password" required minLength={12} autoComplete="new-password" /></div>
        </div>
        <button className="botao" disabled={ocupado}>Criar</button>
      </form>
    </div>
  );
}
