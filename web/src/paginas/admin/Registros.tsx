import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, qs, useApi } from "../../api";
import { Chips, Estado, Paginacao, SeloCategoria, SeloDemo, SeloSituacao, SeloVerificacao, useTitulo } from "../../componentes/base";
import { lista } from "../../componentes/FiltrosUniverso";
import {
  CATEGORIAS, CATEGORIAS_ADM, SITUACOES_CURTAS, SITUACOES_PESQUISA, STATUS_VALIDACAO, TIPOS_DOCUMENTO, TIPOS_FONTE, UFS, fmtData, fmtNum, rotulo,
} from "../../rotulos";
import { useAcao } from "./AdminBase";
import { SeletorUniversidade } from "./Coleta";
import { FormIniciativa, type ValoresIniciativa } from "./FormIniciativa";

// ============================================================================ Universidades
export function AdminUniversidades() {
  useTitulo("Universidades (gestão)");
  const [sp, setSp] = useSearchParams();
  const situacao = lista(sp, "situacao_pesquisa");
  const pagina = Number(sp.get("pagina") ?? 1);
  const { dados, erro } = useApi<any>(`/api/admin/universidades${qs({ q: sp.get("q"), estado: sp.get("estado"), situacao_pesquisa: situacao, pagina, por_pagina: 40 })}`);
  const definir = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "pagina") n.delete("pagina"); setSp(n, { replace: true }); };
  return (
    <div className="pilha">
      <div className="linha entre"><h1>Universidades</h1><Link className="botao" to="/admin/universidades/nova">Cadastrar universidade</Link></div>
      <div className="cartao pilha">
        <div className="campos">
          <div><label htmlFor="au-q">Buscar</label><input id="au-q" type="search" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => { if (e.key === "Enter") definir("q", (e.target as HTMLInputElement).value || null); }} placeholder="nome/sigla + Enter" /></div>
          <div><label htmlFor="au-uf">UF</label><select id="au-uf" value={sp.get("estado") ?? ""} onChange={(e) => definir("estado", e.target.value || null)}>
            <option value="">Todas</option>{Object.keys(UFS).map((u) => <option key={u}>{u}</option>)}</select></div>
        </div>
        <div><label>Situação da pesquisa</label><Chips rotuloGrupo="Situação" opcoes={SITUACOES_CURTAS} selecionados={situacao} aoMudar={(v) => definir("situacao_pesquisa", v.join(",") || null)} /></div>
      </div>
      <Estado erro={erro} carregando={!dados}>
        {dados && (<>
          <div className="tabela-rolagem"><table>
            <thead><tr><th>Universidade</th><th>UF</th><th>Categoria</th><th>Situação</th><th className="num">Validadas</th><th>Verificação</th></tr></thead>
            <tbody>{dados.itens.map((u: any) => (
              <tr key={u.id}><td><Link to={`/admin/universidades/${u.id}`}>{u.nome_oficial}</Link> {u.sigla && `(${u.sigla})`} <SeloDemo origem={u.origem_dados} /></td>
                <td>{u.estado}</td><td>{rotulo(CATEGORIAS_ADM, u.categoria_administrativa)}</td><td><SeloSituacao situacao={u.situacao_pesquisa} /></td>
                <td className="num">{fmtNum(u.iniciativas_validadas)}</td><td>{fmtData(u.data_ultima_verificacao)}</td></tr>))}</tbody>
          </table></div>
          <Paginacao pagina={dados.pagina} totalPaginas={dados.total_paginas} total={dados.total} aoMudar={(p) => definir("pagina", String(p))} />
        </>)}
      </Estado>
    </div>
  );
}

function FormUniversidade({ u, aoSalvar, ocupado }: { u?: any; aoSalvar: (d: any) => void; ocupado: boolean }) {
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    aoSalvar({ ...f, codigo_institucional: f.codigo_institucional ? Number(f.codigo_institucional) : null });
  };
  return (
    <form onSubmit={enviar} className="cartao">
      <div className="campo"><label htmlFor="fu-nome">Nome oficial *</label><input id="fu-nome" name="nome_oficial" type="text" required defaultValue={u?.nome_oficial} /></div>
      <div className="campos">
        <div className="campo"><label htmlFor="fu-sigla">Sigla</label><input id="fu-sigla" name="sigla" type="text" defaultValue={u?.sigla ?? ""} /></div>
        <div className="campo"><label htmlFor="fu-cod">Código e-MEC</label><input id="fu-cod" name="codigo_institucional" type="number" defaultValue={u?.codigo_institucional ?? ""} /></div>
        <div className="campo"><label htmlFor="fu-cat">Categoria administrativa *</label><select id="fu-cat" name="categoria_administrativa" defaultValue={u?.categoria_administrativa ?? "publica_federal"}>
          {Object.entries(CATEGORIAS_ADM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="campo"><label htmlFor="fu-sub">Subcategoria</label><input id="fu-sub" name="subcategoria" type="text" defaultValue={u?.subcategoria ?? ""} /></div>
        <div className="campo"><label htmlFor="fu-uf">UF *</label><select id="fu-uf" name="estado" defaultValue={u?.estado ?? "RS"}>{Object.keys(UFS).map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="campo"><label htmlFor="fu-mun">Município (sede)</label><input id="fu-mun" name="municipio" type="text" defaultValue={u?.municipio ?? ""} /></div>
        <div className="campo"><label htmlFor="fu-site">Site oficial</label><input id="fu-site" name="site_oficial" type="url" defaultValue={u?.site_oficial ?? ""} /></div>
        <div className="campo"><label htmlFor="fu-dom">Domínio institucional</label><input id="fu-dom" name="dominio" type="text" defaultValue={u?.dominio ?? ""} placeholder="ufrgs.br" /></div>
      </div>
      <div className="campo"><label htmlFor="fu-fonte">Fonte do cadastro</label><input id="fu-fonte" name="fonte_cadastro" type="text" defaultValue={u?.fonte_cadastro ?? ""} /></div>
      <div className="campo"><label htmlFor="fu-just">Justificativa</label><input id="fu-just" name="justificativa" type="text" /></div>
      <button className="botao" disabled={ocupado}>Salvar</button>
    </form>
  );
}

export function AdminUniversidade() {
  const { id } = useParams();
  const nova = id === "nova";
  const navegar = useNavigate();
  const { dados: u, erro, recarregar } = useApi<any>(nova ? null : `/api/admin/universidades/${id}`);
  useTitulo(nova ? "Nova universidade" : u?.sigla ?? "Universidade");
  const { executar, ocupado, Mensagem } = useAcao();
  const [just, setJust] = useState("");
  const [campus, setCampus] = useState("");
  const salvar = async (d: any) => {
    let novoId: number | null = null;
    const ok = await executar(async () => {
      const r = await api<any>(nova ? "/api/admin/universidades" : `/api/admin/universidades/${id}`, { metodo: nova ? "POST" : "PUT", corpo: d });
      novoId = r.id;
    }, "Registro salvo com histórico.");
    if (ok && nova && novoId) navegar(`/admin/universidades/${novoId}`); else if (ok) void recarregar();
  };
  const situacao = async (acao: string, extra: object = {}) => {
    if (await executar(() => api(`/api/admin/universidades/${id}/situacao`, { corpo: { acao, justificativa: just, ...extra } }), "Situação atualizada.")) { setJust(""); void recarregar(); }
  };
  if (nova) return <div className="pilha"><h1>Cadastrar universidade</h1><Mensagem /><FormUniversidade aoSalvar={salvar} ocupado={ocupado} /></div>;
  return (
    <Estado erro={erro} carregando={!u}>
      {u && (
        <div className="pilha">
          <nav className="muito-discreto"><Link to="/admin/universidades">Universidades</Link> › {u.sigla ?? u.id}</nav>
          <h1>{u.nome_oficial}</h1>
          <div className="linha"><SeloSituacao situacao={u.situacao_pesquisa} /><Link to={`/universidades/${u.id}`}>Ver página pública</Link>
            <Link to={`/admin/historico?entidade=universidades&registro_id=${u.id}`}>Histórico</Link></div>
          <Mensagem />
          <section className="cartao pilha">
            <h2>Situação da pesquisa</h2>
            <p>{SITUACOES_PESQUISA[u.situacao_pesquisa]} · última verificação {fmtData(u.data_ultima_verificacao)}</p>
            <p className="muito-discreto">Candidatos: {u.candidatos_por_status.map((c: any) => `${c.status} ${c.n}`).join(" · ") || "nenhum"}</p>
            <div className="campo"><label htmlFor="un-just">Justificativa (obrigatória)</label><input id="un-just" type="text" value={just} onChange={(e) => setJust(e.target.value)} /></div>
            <div className="linha">
              <button className="botao" disabled={ocupado || just.length < 5} onClick={() => situacao("concluir")}>Concluir pesquisa</button>
              <button className="botao botao-sec" disabled={ocupado || just.length < 5} onClick={() => situacao("inconclusiva")}>Declarar inconclusiva</button>
              <button className="botao botao-sec" disabled={ocupado || just.length < 5} onClick={() => situacao("reabrir")}>Reabrir (em pesquisa)</button>
              <button className="botao botao-sec" disabled={ocupado || just.length < 5} onClick={() => situacao("definir", { situacao: "nao_pesquisada" })}>Marcar não pesquisada</button>
            </div>
            <p className="muito-discreto">“Concluir” exige fontes consultadas registradas e nenhum candidato pendente; o resultado (com/sem iniciativas) é calculado das iniciativas validadas.</p>
          </section>
          <section><h2>Execuções de coleta</h2>
            {u.execucoes.length === 0 ? <p className="discreto">Nenhuma coleta registrada.</p> : <ul>{u.execucoes.map((e: any) => <li key={e.id}><Link to={`/admin/coleta/${e.id}`}>{e.identificador}</Link> · {e.status} · {e.candidatos_encontrados} candidatos · {fmtData(e.iniciada_em)}</li>)}</ul>}
            <Link to={`/admin/revisao?universidade_id=${u.id}`}>Candidatos desta universidade</Link> · <Link to={`/admin/iniciativas?universidade_id=${u.id}`}>Iniciativas</Link> · <Link to={`/admin/iniciativas/nova?universidade_id=${u.id}`}>Nova iniciativa</Link>
          </section>
          <section><h2>Campi</h2>
            <ul>{u.campi.map((c: any) => <li key={c.id}>{c.nome} {c.municipio && `— ${c.municipio}`}</li>)}</ul>
            <div className="linha"><input type="text" aria-label="Nome do campus" value={campus} onChange={(e) => setCampus(e.target.value)} placeholder="Nome do campus" style={{ maxWidth: 320 }} />
              <button className="botao botao-sec" disabled={!campus || ocupado} onClick={async () => { if (await executar(() => api(`/api/admin/universidades/${id}/campi`, { corpo: { nome: campus } }), "Campus cadastrado.")) { setCampus(""); void recarregar(); } }}>Adicionar campus</button></div>
          </section>
          <section><h2>Dados cadastrais</h2><FormUniversidade u={u} aoSalvar={salvar} ocupado={ocupado} /></section>
        </div>
      )}
    </Estado>
  );
}

// ============================================================================ Iniciativas
export function AdminIniciativas() {
  useTitulo("Iniciativas (gestão)");
  const [sp, setSp] = useSearchParams();
  const status = lista(sp, "status_validacao");
  const pagina = Number(sp.get("pagina") ?? 1);
  const { dados, erro } = useApi<any>(`/api/admin/iniciativas${qs({ q: sp.get("q"), status_validacao: status, universidade_id: sp.get("universidade_id"), pagina, por_pagina: 40, ordenar: "recentes" })}`);
  const definir = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "pagina") n.delete("pagina"); setSp(n, { replace: true }); };
  return (
    <div className="pilha">
      <div className="linha entre"><h1>Iniciativas</h1><Link className="botao" to="/admin/iniciativas/nova">Cadastrar iniciativa</Link></div>
      <div className="cartao pilha">
        <div style={{ maxWidth: 360 }}><label htmlFor="ai-q">Buscar</label><input id="ai-q" type="search" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => { if (e.key === "Enter") definir("q", (e.target as HTMLInputElement).value || null); }} placeholder="texto + Enter" /></div>
        <div><label>Status de validação</label><Chips rotuloGrupo="Status" opcoes={STATUS_VALIDACAO} selecionados={status} aoMudar={(v) => definir("status_validacao", v.join(",") || null)} /></div>
      </div>
      <Estado erro={erro} carregando={!dados} vazio={dados?.total === 0}>
        {dados && (<>
          <div className="tabela-rolagem"><table>
            <thead><tr><th>Iniciativa</th><th>Universidade</th><th>Categoria</th><th>Nível</th><th>Status</th><th className="num">Evidências</th></tr></thead>
            <tbody>{dados.itens.map((i: any) => (
              <tr key={i.id}><td><Link to={`/admin/iniciativas/${i.id}`}>{i.nome}</Link> <SeloDemo origem={i.origem_dados} /></td><td>{i.universidade_sigla}</td>
                <td><SeloCategoria codigo={i.categoria_principal} /></td><td className="num">{i.grau_evidencia}</td><td>{rotulo(STATUS_VALIDACAO, i.status_validacao)}</td><td className="num">{i.n_evidencias}</td></tr>))}</tbody>
          </table></div>
          <Paginacao pagina={dados.pagina} totalPaginas={dados.total_paginas} total={dados.total} aoMudar={(p) => definir("pagina", String(p))} />
        </>)}
      </Estado>
    </div>
  );
}

export function AdminIniciativa() {
  const { id } = useParams();
  const nova = id === "nova";
  const [sp] = useSearchParams();
  const navegar = useNavigate();
  const { dados: i, erro, recarregar } = useApi<any>(nova ? null : `/api/admin/iniciativas/${id}`);
  const [uni, setUni] = useState<any>(null);
  const { dados: uniPre } = useApi<any>(nova && sp.get("universidade_id") ? `/api/admin/universidades/${sp.get("universidade_id")}` : null);
  useTitulo(nova ? "Nova iniciativa" : i?.nome ?? "Iniciativa");
  const { executar, ocupado, Mensagem } = useAcao();
  const [rel, setRel] = useState({ destino_id: "", tipo: "vinculada_a_politica" });
  const [statusNovo, setStatusNovo] = useState({ status: "validada", justificativa: "" });
  const universidade = uni ?? uniPre;

  const salvar = async (v: ValoresIniciativa) => {
    let novoId: number | null = null;
    const ok = await executar(async () => {
      const r = await api<any>(nova ? "/api/admin/iniciativas" : `/api/admin/iniciativas/${id}`, { metodo: nova ? "POST" : "PUT", corpo: v });
      novoId = r.id;
    }, "Iniciativa salva com histórico.");
    if (ok && nova && novoId) navegar(`/admin/iniciativas/${novoId}`); else if (ok) void recarregar();
  };

  if (nova) return (
    <div className="pilha">
      <h1>Cadastrar iniciativa</h1>
      <SeletorUniversidade valor={universidade} aoMudar={setUni} />
      <Mensagem />
      {universidade && <FormIniciativa modo="criar" universidadeId={universidade.id} ocupado={ocupado} aoEnviar={salvar}
        iniciais={{ nome: "", categoria_principal: "servico_permanente", categorias_secundarias: [], publicos: [], situacao_documentada: "desconhecida", grau_evidencia: 3, status_validacao: "pendente", documentos_ids: [] }} />}
    </div>
  );
  return (
    <Estado erro={erro} carregando={!i}>
      {i && (
        <div className="pilha">
          <nav className="muito-discreto"><Link to="/admin/iniciativas">Iniciativas</Link> › #{i.id}</nav>
          <h1>{i.nome}</h1>
          <div className="linha"><SeloCategoria codigo={i.categoria_principal} /><span className="selo">{rotulo(STATUS_VALIDACAO, i.status_validacao)}</span>
            {i.status_validacao === "validada" && <Link to={`/iniciativas/${i.id}`}>Ver página pública</Link>}</div>
          <Mensagem />
          <section className="cartao">
            <h2>Status de validação</h2>
            <div className="campos">
              <div><label htmlFor="ai-st">Novo status</label><select id="ai-st" value={statusNovo.status} onChange={(e) => setStatusNovo({ ...statusNovo, status: e.target.value })}>
                {Object.entries(STATUS_VALIDACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label htmlFor="ai-sj">Justificativa</label><input id="ai-sj" type="text" value={statusNovo.justificativa} onChange={(e) => setStatusNovo({ ...statusNovo, justificativa: e.target.value })} /></div>
              <div><button className="botao" disabled={ocupado || statusNovo.justificativa.length < 3} onClick={async () => { if (await executar(() => api(`/api/admin/iniciativas/${id}/status`, { corpo: statusNovo }), "Status alterado.")) void recarregar(); }}>Aplicar</button></div>
            </div>
          </section>
          <section className="cartao">
            <h2>Evidências ({i.evidencias.length})</h2>
            {i.evidencias.map((e: any) => (
              <div key={e.id} style={{ marginBottom: 12 }}>
                <blockquote className="citacao">“{e.trecho_evidencia}”</blockquote>
                <div className="linha"><a href={e.url_original} target="_blank" rel="noopener noreferrer">{e.fonte_titulo ?? e.url_original}</a><SeloVerificacao v={e.verificacao_trecho} />
                  <button className="botao botao-perigo botao-peq" disabled={ocupado} onClick={async () => {
                    const j = window.prompt("Justificativa para remover esta evidência:");
                    if (j && await executar(() => api(`/api/admin/iniciativas/${id}/evidencias/${e.id}`, { metodo: "DELETE", corpo: { justificativa: j } }), "Evidência removida.")) void recarregar();
                  }}>Remover</button></div>
              </div>
            ))}
          </section>
          <section className="cartao">
            <h2>Relações</h2>
            <ul>{i.relacoes.map((r: any) => <li key={r.id}>{r.direcao === "saida" ? "→" : "←"} {r.tipo}: <Link to={`/admin/iniciativas/${r.iniciativa_id}`}>{r.nome}</Link> ({r.status_validacao})
              <button className="botao botao-sec botao-peq" style={{ marginLeft: 8 }} onClick={async () => { if (await executar(() => api(`/api/admin/relacoes/${r.id}`, { metodo: "DELETE", corpo: {} }), "Relação removida.")) void recarregar(); }}>Remover</button></li>)}</ul>
            <div className="campos">
              <div><label htmlFor="ai-rid">ID da iniciativa relacionada</label><input id="ai-rid" type="number" value={rel.destino_id} onChange={(e) => setRel({ ...rel, destino_id: e.target.value })} /></div>
              <div><label htmlFor="ai-rt">Tipo</label><select id="ai-rt" value={rel.tipo} onChange={(e) => setRel({ ...rel, tipo: e.target.value })}>
                <option value="vinculada_a_politica">Vinculada à política</option><option value="parte_de">Parte de</option><option value="relacionada">Relacionada</option></select></div>
              <div><button className="botao botao-sec" disabled={!rel.destino_id || ocupado} onClick={async () => { if (await executar(() => api(`/api/admin/iniciativas/${id}/relacoes`, { corpo: { destino_id: Number(rel.destino_id), tipo: rel.tipo } }), "Relação criada.")) void recarregar(); }}>Relacionar</button></div>
            </div>
          </section>
          {i.possiveis_duplicidades.length > 0 && <div className="aviso">Possíveis duplicidades: {i.possiveis_duplicidades.map((d: any) => <span key={d.id}><Link to={`/admin/iniciativas/${d.outra_id}`}>{d.outra_nome}</Link> ({d.status}) </span>)} — <Link to="/admin/duplicidades">revisar</Link></div>}
          <section><h2>Editar</h2>
            <FormIniciativa key={i.id + (i.data_ultima_verificacao ?? "")} modo="editar" universidadeId={i.universidade_id} ocupado={ocupado} aoEnviar={salvar}
              iniciais={{ ...i, documentos_ids: i.documentos.map((d: any) => d.id), justificativa: "" }} />
          </section>
          <section className="cartao"><h2>Histórico de alterações</h2>
            <div className="tabela-rolagem"><table><thead><tr><th>Data</th><th>Campo</th><th>Anterior</th><th>Novo</th><th>Responsável</th><th>Justificativa</th></tr></thead>
              <tbody>{i.historico.map((h: any) => <tr key={h.id}><td>{fmtData(h.alterado_em)}</td><td>{h.campo}</td><td className="muito-discreto">{h.valor_anterior}</td><td>{h.valor_novo}</td><td>{h.responsavel ?? "sistema"}</td><td>{h.justificativa}</td></tr>)}</tbody></table></div>
          </section>
        </div>
      )}
    </Estado>
  );
}

// ============================================================================ Documentos e fontes
export function AdminDocumentos() {
  useTitulo("Documentos e fontes");
  const [aba, setAba] = useState<"documentos" | "fontes">("documentos");
  const [uni, setUni] = useState<any>(null);
  const { dados: docs, recarregar } = useApi<any>(`/api/admin/documentos${qs({ universidade_id: uni?.id })}`);
  const { dados: fontes, recarregar: recFontes } = useApi<any>(aba === "fontes" ? `/api/admin/fontes${qs({ universidade_id: uni?.id })}` : null);
  const { executar, ocupado, Mensagem } = useAcao();
  const novoDoc = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (await executar(() => api("/api/admin/documentos", { corpo: { ...f, universidade_id: uni.id, data_publicacao: f.data_publicacao || null } }), "Documento cadastrado.")) { form.reset(); void recarregar(); }
  };
  const situacaoFonte = async (f: any, situacao: string) => {
    if (await executar(() => api(`/api/admin/fontes/${f.id}`, { metodo: "PUT", corpo: { titulo: f.titulo, tipo_fonte: f.tipo_fonte, situacao_fonte: situacao, data_publicacao: f.data_publicacao, observacoes: f.observacoes } }), "Fonte atualizada.")) void recFontes();
  };
  return (
    <div className="pilha">
      <h1>Documentos e fontes</h1>
      <SeletorUniversidade valor={uni} aoMudar={setUni} />
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={aba === "documentos"} onClick={() => setAba("documentos")}>Documentos</button>
        <button role="tab" aria-selected={aba === "fontes"} onClick={() => setAba("fontes")}>Fontes</button>
      </div>
      <Mensagem />
      {aba === "documentos" ? (
        <>
          {uni && (
            <form className="cartao" onSubmit={novoDoc}>
              <h2>Novo documento — {uni.sigla ?? uni.nome_oficial}</h2>
              <div className="campo"><label htmlFor="nd-t">Título *</label><input id="nd-t" name="titulo" type="text" required /></div>
              <div className="campos">
                <div className="campo"><label htmlFor="nd-tipo">Tipo *</label><select id="nd-tipo" name="tipo_documento">{Object.entries(TIPOS_DOCUMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div className="campo"><label htmlFor="nd-n">Número</label><input id="nd-n" name="numero_documento" type="text" /></div>
                <div className="campo"><label htmlFor="nd-d">Data de publicação</label><input id="nd-d" name="data_publicacao" type="date" /></div>
                <div className="campo"><label htmlFor="nd-o">Órgão emissor</label><input id="nd-o" name="orgao_emissor" type="text" /></div>
              </div>
              <div className="campo"><label htmlFor="nd-u">URL original</label><input id="nd-u" name="url_original" type="url" /></div>
              <button className="botao" disabled={ocupado}>Cadastrar</button>
            </form>
          )}
          <div className="tabela-rolagem"><table>
            <thead><tr><th>Documento</th><th>Univ.</th><th>Tipo</th><th>Número</th><th>Data</th><th className="num">Iniciativas</th></tr></thead>
            <tbody>{(docs?.itens ?? []).map((d: any) => <tr key={d.id}><td>{d.url_original ? <a href={d.url_original} target="_blank" rel="noopener noreferrer">{d.titulo}</a> : d.titulo}</td><td>{d.sigla}</td><td>{TIPOS_DOCUMENTO[d.tipo_documento]}</td><td>{d.numero_documento ?? "—"}</td><td>{fmtData(d.data_publicacao)}</td><td className="num">{d.n_iniciativas}</td></tr>)}</tbody>
          </table></div>
        </>
      ) : (
        <div className="tabela-rolagem"><table>
          <thead><tr><th>Fonte</th><th>Univ.</th><th>Tipo</th><th>Consulta</th><th className="num">Evidências</th><th>Situação</th></tr></thead>
          <tbody>{(fontes?.itens ?? []).map((f: any) => <tr key={f.id}><td style={{ wordBreak: "break-all" }}><a href={f.url_original} target="_blank" rel="noopener noreferrer">{f.titulo ?? f.url_original}</a></td><td>{f.sigla}</td><td>{TIPOS_FONTE[f.tipo_fonte]}</td><td>{fmtData(f.data_consulta)}</td><td className="num">{f.n_evidencias}</td>
            <td><select aria-label="Situação da fonte" value={f.situacao_fonte} onChange={(e) => situacaoFonte(f, e.target.value)}>
              <option value="acessivel">Acessível</option><option value="indisponivel">Indisponível</option><option value="alterada">Alterada</option><option value="nao_verificada">Não verificada</option></select></td></tr>)}</tbody>
        </table></div>
      )}
      <p className="muito-discreto">Categorias: {Object.values(CATEGORIAS).join(" · ")}</p>
    </div>
  );
}
