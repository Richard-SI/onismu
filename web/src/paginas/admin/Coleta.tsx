import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, qs, useApi } from "../../api";
import { Estado, Paginacao, SeloVerificacao, useTitulo } from "../../componentes/base";
import { STATUS_CANDIDATO, fmtData, fmtNum, rotulo } from "../../rotulos";
import { useAcao } from "./AdminBase";

const STATUS_EXEC: Record<string, string> = { na_fila: "Na fila", em_andamento: "Em andamento", concluida: "Concluída", parcial: "Parcial (com erros)", falhou: "Falhou", interrompida: "Interrompida" };

export function SeletorUniversidade({ valor, aoMudar }: { valor: any; aoMudar: (u: any) => void }) {
  const [q, setQ] = useState("");
  const { dados } = useApi<any>(q.trim().length >= 2 ? `/api/admin/universidades${qs({ q, por_pagina: 8 })}` : null);
  return (
    <div className="campo">
      <label htmlFor="su-q">Universidade</label>
      {valor ? (
        <div className="linha"><strong>{valor.nome_oficial}</strong> {valor.sigla && `(${valor.sigla})`} <button type="button" className="botao botao-sec botao-peq" onClick={() => aoMudar(null)}>Trocar</button></div>
      ) : (
        <>
          <input id="su-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite nome ou sigla" />
          {dados?.itens?.length > 0 && <ul style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>{dados.itens.map((u: any) => (
            <li key={u.id}><button type="button" className="chip" onClick={() => { aoMudar(u); setQ(""); }}>{u.sigla ? `${u.sigla} — ` : ""}{u.nome_oficial} ({u.estado})</button></li>))}</ul>}
        </>
      )}
    </div>
  );
}

export function Coleta() {
  useTitulo("Coleta assistida");
  const [testar, setTestar] = useState(0);
  const { dados: st, carregando: testando } = useApi<any>(`/api/admin/coleta/status${testar ? `?testar=1&n=${testar}` : ""}`);
  const [pagina, setPagina] = useState(1);
  const { dados: execs, recarregar } = useApi<any>(`/api/admin/coleta/execucoes${qs({ pagina, por_pagina: 20 })}`);
  const [uni, setUni] = useState<any>(null);
  const [modo, setModo] = useState<"urls_manuais" | "busca_api">("urls_manuais");
  const [urls, setUrls] = useState("");
  const { executar, ocupado, Mensagem } = useAcao();
  useEffect(() => {
    if (!execs?.itens?.some((e: any) => ["na_fila", "em_andamento"].includes(e.status))) return;
    const t = setInterval(() => void recarregar(), 3000);
    return () => clearInterval(t);
  }, [execs, recarregar]);

  const iniciar = async () => {
    const ok = await executar(() => api("/api/admin/coleta/execucoes", { corpo: {
      universidade_ids: [uni.id], modo, urls: modo === "urls_manuais" ? urls.split(/\s+/).filter(Boolean) : undefined,
    } }), "Coleta enfileirada. Os candidatos aparecerão na fila de revisão.");
    if (ok) { setUrls(""); void recarregar(); }
  };

  return (
    <div className="pilha">
      <h1>Coleta assistida</h1>
      {st && (
        <section className="cartao">
          <h2>Integrações</h2>
          <dl className="dl">
            <dt>Busca na web</dt><dd>{st.busca.disponivel ? <span className="selo selo-ok">✓ {st.busca.provedor}</span> : <span className="selo selo-alerta">! indisponível</span>} {st.busca.motivo}
              {st.busca.disponivel && <button className="botao botao-sec botao-peq" style={{ marginLeft: 8 }} disabled={testando} onClick={() => setTestar((n) => n + 1)}>{testando ? "Testando…" : "Testar busca"}</button>}
              {st.busca.teste && <div className={st.busca.teste.ok ? "muito-discreto" : "erro"} style={{ marginTop: 4 }}>{st.busca.teste.ok ? "✓ " : "✕ "}{st.busca.teste.detalhe}</div>}</dd>
            <dt>Extrator</dt><dd>
              {st.extrator.ia_disponivel ? <span className="selo selo-ok">✓</span> : st.extrator.configurado !== "heuristico" ? <span className="selo selo-alerta">! indisponível</span> : null}{" "}
              {st.extrator.configurado === "claude" ? `IA Claude (${st.extrator.modelo})` : st.extrator.configurado === "ollama" ? `IA local via Ollama (${st.extrator.modelo})` : "Heurístico (sem IA)"}
              {st.extrator.observacao && <span className="muito-discreto"> — {st.extrator.observacao}</span>}</dd>
            <dt>Limites</dt><dd>{st.limites.paginas} páginas/execução · {Math.round(st.limites.bytes / 1e6)} MB/página · {st.limites.timeout_ms / 1000}s · {st.limites.intervalo_host_ms} ms entre acessos ao mesmo site</dd>
          </dl>
          <p className="muito-discreto">Configuração em <code>.env</code> (BUSCA_PROVEDOR, EXTRATOR, OLLAMA_MODELO, BRAVE_API_KEY, ANTHROPIC_API_KEY). Diagnóstico: <code>npm run diagnosticar:coleta -w server</code>. Com o modelo local, conte cerca de 1 minuto por página analisada.</p>
        </section>
      )}
      <section className="cartao">
        <h2>Nova execução</h2>
        <SeletorUniversidade valor={uni} aoMudar={setUni} />
        <div className="campo"><label htmlFor="co-modo">Modo</label>
          <select id="co-modo" value={modo} onChange={(e) => setModo(e.target.value as any)}>
            <option value="urls_manuais">URLs informadas pelo pesquisador</option>
            <option value="busca_api" disabled={!st?.busca.disponivel}>Busca automática ({st?.busca.disponivel ? st.busca.provedor : "provedor não configurado"})</option>
          </select></div>
        {modo === "urls_manuais" && (
          <div className="campo"><label htmlFor="co-urls">URLs (uma por linha, até 50)</label>
            <textarea id="co-urls" value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://www.universidade.br/assistencia-estudantil/saude-mental" /></div>
        )}
        <Mensagem />
        <button className="botao" disabled={!uni || ocupado || (modo === "urls_manuais" && !urls.trim())} onClick={iniciar}>Iniciar coleta</button>
      </section>
      <section>
        <h2>Execuções</h2>
        {execs && (
          <>
            <div className="tabela-rolagem"><table>
              <thead><tr><th>Execução</th><th>Universidade</th><th>Modo</th><th>Status</th><th className="num">Páginas</th><th className="num">Candidatos</th><th className="num">Aprovados</th><th className="num">Erros</th><th>Início</th></tr></thead>
              <tbody>{execs.itens.map((e: any) => (
                <tr key={e.id}>
                  <td><Link to={`/admin/coleta/${e.id}`}>{e.identificador}</Link></td><td>{e.sigla ?? e.nome_oficial}</td><td>{e.modo}</td>
                  <td>{STATUS_EXEC[e.status] ?? e.status}</td><td className="num">{fmtNum(e.paginas_examinadas)}</td><td className="num">{fmtNum(e.candidatos_encontrados)}</td>
                  <td className="num">{fmtNum(e.registros_aprovados)}</td><td className="num">{fmtNum(e.n_erros)}</td><td>{fmtData(e.iniciada_em)}</td>
                </tr>))}</tbody>
            </table></div>
            <Paginacao pagina={execs.pagina} totalPaginas={execs.total_paginas} total={execs.total} aoMudar={setPagina} />
          </>
        )}
      </section>
    </div>
  );
}

export function ExecucaoDetalhe() {
  const { id } = useParams();
  const { dados: e, erro } = useApi<any>(`/api/admin/coleta/execucoes/${id}`);
  useTitulo(e?.identificador ?? "Execução");
  return (
    <Estado erro={erro} carregando={!e}>
      {e && (
        <div className="pilha">
          <nav className="muito-discreto"><Link to="/admin/coleta">Coleta</Link> › {e.identificador}</nav>
          <h1>{e.identificador}</h1>
          <section className="cartao"><dl className="dl">
            <dt>Universidade</dt><dd><Link to={`/admin/universidades/${e.universidade_id}`}>{e.nome_oficial}</Link></dd>
            <dt>Modo · ferramenta</dt><dd>{e.modo} · {e.ferramenta}</dd>
            <dt>Status</dt><dd>{STATUS_EXEC[e.status] ?? e.status}{e.resultado_declarado ? ` · resultado declarado: ${e.resultado_declarado}` : ""}</dd>
            <dt>Período</dt><dd>{fmtData(e.iniciada_em)} → {fmtData(e.finalizada_em)}</dd>
            <dt>Iniciada por</dt><dd>{e.iniciada_por_nome ?? "sistema / importação"}</dd>
            <dt>Responsáveis pela validação</dt><dd>{e.responsaveis_validacao?.join(", ") || "—"}</dd>
            <dt>Páginas · candidatos · aprovados</dt><dd>{e.paginas_examinadas} · {e.candidatos_encontrados} · {e.registros_aprovados}</dd>
            {e.observacoes && <><dt>Observações</dt><dd>{e.observacoes}</dd></>}
          </dl></section>
          {e.termos_busca?.length > 0 && <section className="cartao"><h2>Termos de busca</h2><ul>{e.termos_busca.map((t: string) => <li key={t}><code>{t}</code></li>)}</ul></section>}
          {(e.pendencias?.length > 0 || e.erros?.length > 0) && (
            <section className="cartao"><h2>Pendências e erros</h2>
              <ul>{e.pendencias.map((p: string) => <li key={p}>{p}</li>)}</ul>
              {e.erros.length > 0 && <pre className="bloco">{JSON.stringify(e.erros, null, 2)}</pre>}
            </section>
          )}
          <section><h2>Fontes consultadas ({e.paginas.length})</h2>
            <div className="tabela-rolagem"><table>
              <thead><tr><th>URL</th><th>Status</th><th>HTTP</th><th>Observação</th></tr></thead>
              <tbody>{e.paginas.map((p: any) => (
                <tr key={p.id}><td style={{ wordBreak: "break-all" }}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.titulo ?? p.url}</a></td>
                  <td>{p.status}</td><td className="num">{p.http_status ?? "—"}</td><td className="muito-discreto">{p.erro ?? p.observacao ?? ""}</td></tr>))}</tbody>
            </table></div>
          </section>
          <section><h2>Candidatos ({e.candidatos.length})</h2>
            <ul>{e.candidatos.map((c: any) => <li key={c.id}><Link to={`/admin/revisao/${c.id}`}>{c.nome}</Link> — {rotulo(STATUS_CANDIDATO, c.status)} <SeloVerificacao v={c.verificacao_trecho} /></li>)}</ul>
          </section>
        </div>
      )}
    </Estado>
  );
}
