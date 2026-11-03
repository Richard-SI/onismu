import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, qs, useApi } from "../../api";
import { Chips, Estado, Paginacao, SeloCategoria, SeloVerificacao, useTitulo } from "../../componentes/base";
import { lista } from "../../componentes/FiltrosUniverso";
import { CATEGORIAS, GRAUS, PUBLICOS, STATUS_CANDIDATO, TIPOS_FONTE, VERIFICACAO, fmtData, rotulo } from "../../rotulos";
import { useAcao } from "./AdminBase";
import { FormIniciativa } from "./FormIniciativa";

export function FilaRevisao() {
  useTitulo("Fila de revisão");
  const [sp, setSp] = useSearchParams();
  const status = lista(sp, "status");
  const verificacao = lista(sp, "verificacao");
  const pagina = Number(sp.get("pagina") ?? 1);
  const { dados, erro, carregando } = useApi<any>(`/api/admin/candidatos${qs({ status, verificacao, q: sp.get("q"), universidade_id: sp.get("universidade_id"), pagina, por_pagina: 30 })}`);
  const definir = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== "pagina") n.delete("pagina"); setSp(n, { replace: true }); };
  return (
    <div className="pilha">
      <h1>Fila de revisão da coleta</h1>
      <p className="discreto">Candidatos sugeridos pela coleta (busca, extrator ou pesquisa-piloto). Nenhum é público antes de aprovado.</p>
      <div className="cartao pilha">
        <div><label>Status</label><Chips rotuloGrupo="Status" opcoes={STATUS_CANDIDATO} selecionados={status.length ? status : ["pendente"]} aoMudar={(v) => definir("status", v.join(",") || null)} /></div>
        <div><label>Verificação do trecho</label><Chips rotuloGrupo="Verificação" opcoes={VERIFICACAO} selecionados={verificacao} aoMudar={(v) => definir("verificacao", v.join(",") || null)} /></div>
        <div style={{ maxWidth: 360 }}><label htmlFor="fr-q">Buscar</label>
          <input id="fr-q" type="search" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => { if (e.key === "Enter") definir("q", (e.target as HTMLInputElement).value || null); }} placeholder="nome ou universidade + Enter" /></div>
      </div>
      <Estado erro={erro} carregando={carregando && !dados} vazio={dados?.total === 0}>
        {dados && (
          <>
            <div className="tabela-rolagem"><table>
              <thead><tr><th>Candidato</th><th>Universidade</th><th>Categoria sugerida</th><th>Confiança</th><th>Verificação</th><th>Duplicatas</th><th>Status</th></tr></thead>
              <tbody>{dados.itens.map((c: any) => (
                <tr key={c.id}>
                  <td><Link to={`/admin/revisao/${c.id}`}>{c.nome}</Link><div className="muito-discreto">#{c.id} · {c.execucao}</div></td>
                  <td>{c.universidade_sigla} <span className="muito-discreto">({c.estado})</span></td>
                  <td><SeloCategoria codigo={c.categoria_sugerida} /><div className="muito-discreto">Nível {c.grau_evidencia_sugerido}</div></td>
                  <td>{c.confianca}</td>
                  <td><SeloVerificacao v={c.verificacao_trecho} /></td>
                  <td className="num">{c.n_duplicatas > 0 ? <span className="selo selo-alerta">{c.n_duplicatas}</span> : "—"}</td>
                  <td>{rotulo(STATUS_CANDIDATO, c.status)}</td>
                </tr>))}</tbody>
            </table></div>
            <Paginacao pagina={dados.pagina} totalPaginas={dados.total_paginas} total={dados.total} aoMudar={(p) => definir("pagina", String(p))} />
          </>
        )}
      </Estado>
    </div>
  );
}

export function CandidatoDetalhe() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { dados: c, erro, recarregar } = useApi<any>(`/api/admin/candidatos/${id}`);
  useTitulo(c ? `Revisão: ${c.nome}` : "Revisão");
  const { executar, ocupado, Mensagem } = useAcao();
  const [modo, setModo] = useState<"" | "editar" | "rejeitar" | "inconclusivo" | "recoleta" | "vincular">("");
  const [motivo, setMotivo] = useState("");
  const [vincularId, setVincularId] = useState("");
  const pendente = c && (c.status === "pendente" || c.status === "recoleta_solicitada");
  const d = c?.dados ?? {};

  const decidir = async (acao: string, corpo: object, msg: string) => {
    const ok = await executar(() => api(`/api/admin/candidatos/${id}/${acao}`, { corpo }), msg);
    if (ok) { setModo(""); void recarregar(); }
  };
  const aprovar = async (edicoes: object = {}) => {
    let iniciativa: number | null = null;
    const ok = await executar(async () => { iniciativa = (await api<any>(`/api/admin/candidatos/${id}/aprovar`, { corpo: { edicoes } })).iniciativa_id; },
      "Aprovado e publicado no catálogo.");
    if (ok && iniciativa) navegar(`/admin/iniciativas/${iniciativa}`);
  };

  return (
    <Estado erro={erro} carregando={!c}>
      {c && (
        <div className="pilha">
          <nav className="muito-discreto"><Link to="/admin/revisao">Fila de revisão</Link> › #{c.id}</nav>
          <div className="linha entre">
            <div>
              <h1>{c.nome}</h1>
              <div className="linha"><SeloCategoria codigo={c.categoria_sugerida} /><span className="selo">{GRAUS[c.grau_evidencia_sugerido]}</span>
                <span className="selo">confiança {c.confianca}</span><span className="selo">{rotulo(STATUS_CANDIDATO, c.status)}</span></div>
            </div>
          </div>
          <Mensagem />
          <div className="grade grade-2">
            <section className="cartao">
              <h2>Fonte original e evidência</h2>
              <p><a href={c.url_fonte} target="_blank" rel="noopener noreferrer">{c.titulo_fonte ?? c.url_fonte}</a></p>
              <p className="muito-discreto">{rotulo(TIPOS_FONTE, c.tipo_fonte)} · {c.universidade_nome} · domínio oficial: {c.dominio ?? "não informado"}</p>
              <blockquote className="citacao">“{c.trecho_evidencia}”</blockquote>
              <div className="linha"><SeloVerificacao v={c.verificacao_trecho} />
                <button className="botao botao-sec botao-peq" disabled={ocupado} onClick={async () => { await executar(() => api(`/api/admin/candidatos/${id}/verificar-trecho`, { corpo: {} }), "Verificação concluída."); void recarregar(); }}>
                  Conferir trecho na fonte agora</button></div>
              {c.verificacao_detalhe && <p className="muito-discreto" style={{ marginTop: 6 }}>{c.verificacao_detalhe}</p>}
            </section>
            <section className="cartao">
              <h2>Dados extraídos</h2>
              <dl className="dl">
                <dt>Categoria sugerida</dt><dd>{rotulo(CATEGORIAS, c.categoria_sugerida)}{d.categorias_secundarias?.length ? ` (+ ${d.categorias_secundarias.map((x: string) => rotulo(CATEGORIAS, x)).join(", ")})` : ""}</dd>
                <dt>Descrição</dt><dd>{d.descricao ?? "—"}</dd>
                <dt>Objetivos</dt><dd>{d.objetivos ?? "—"}</dd>
                <dt>Público-alvo</dt><dd>{(d.publico_alvo ?? []).map((p: string) => rotulo(PUBLICOS, p)).join(", ") || "—"}</dd>
                <dt>Unidade responsável</dt><dd>{d.unidade_responsavel ?? "—"}</dd>
                <dt>Situação aparente</dt><dd>{d.situacao_aparente ?? "—"}</dd>
                <dt>Período</dt><dd>{d.periodo ?? "—"}</dd>
                <dt>Documento relacionado</dt><dd>{d.documento_relacionado ? <>{d.documento_relacionado.titulo} {d.documento_relacionado.numero_documento ? `nº ${d.documento_relacionado.numero_documento}` : ""} {d.documento_relacionado.url_original && <a href={d.documento_relacionado.url_original} target="_blank" rel="noopener noreferrer">(abrir)</a>}</> : "—"}</dd>
                <dt>Campos ausentes</dt><dd>{c.campos_ausentes?.join(", ") || "—"}</dd>
                <dt>Justificativa</dt><dd>{c.justificativa ?? "—"}</dd>
                {d.avisos_validacao?.length > 0 && <><dt>Avisos da validação</dt><dd><ul style={{ margin: 0, paddingLeft: 18 }}>{d.avisos_validacao.map((a: string) => <li key={a}>{a}</li>)}</ul></dd></>}
              </dl>
            </section>
          </div>

          <section className="cartao">
            <h2>Possíveis duplicidades</h2>
            {c.possiveis_duplicatas_atuais.length === 0 ? <p className="discreto">Nenhum registro semelhante na mesma universidade.</p> : (
              <ul>{c.possiveis_duplicatas_atuais.map((x: any) => (
                <li key={`${x.tipo}${x.id}`}>{x.tipo === "iniciativa" ? <Link to={`/admin/iniciativas/${x.id}`}>{x.nome}</Link> : <Link to={`/admin/revisao/${x.id}`}>{x.nome}</Link>}
                  {" "}<span className="muito-discreto">({x.tipo} #{x.id}, {x.status}, similaridade {x.similaridade}, {x.motivo})</span>
                  {x.tipo === "iniciativa" && pendente && <button className="botao botao-sec botao-peq" style={{ marginLeft: 8 }} onClick={() => { setModo("vincular"); setVincularId(String(x.id)); }}>Vincular a esta</button>}
                </li>))}</ul>
            )}
          </section>

          <section className="cartao">
            <h2>Execução de coleta</h2>
            <p><Link to={`/admin/coleta/${c.execucao_id}`}>{c.execucao_identificador}</Link> · {c.modo} · {c.ferramenta} · {fmtData(c.iniciada_em)} · extrator: {c.extrator}</p>
            {c.consulta && <p className="muito-discreto">Consulta que levou à página: {c.consulta}</p>}
            {c.decidido_em && <p>Decisão: <strong>{rotulo(STATUS_CANDIDATO, c.status)}</strong> por {c.decidido_por_nome} em {fmtData(c.decidido_em)}{c.motivo_decisao ? ` — ${c.motivo_decisao}` : ""}
              {c.iniciativa_id && <> · <Link to={`/admin/iniciativas/${c.iniciativa_id}`}>{c.iniciativa_nome}</Link></>}</p>}
          </section>

          {pendente && (
            <section className="cartao pilha">
              <h2>Decisão</h2>
              <div className="linha">
                <button className="botao" disabled={ocupado} onClick={() => aprovar()}>Aprovar como está</button>
                <button className="botao botao-sec" onClick={() => setModo("editar")}>Editar e aprovar</button>
                <button className="botao botao-sec" onClick={() => setModo("vincular")}>Vincular a iniciativa existente</button>
                <button className="botao botao-sec" onClick={() => setModo("inconclusivo")}>Marcar inconclusivo</button>
                <button className="botao botao-sec" onClick={() => setModo("recoleta")}>Solicitar nova coleta</button>
                <button className="botao botao-perigo" onClick={() => setModo("rejeitar")}>Rejeitar</button>
              </div>
              {c.verificacao_trecho !== "confirmado" && <div className="aviso">O trecho ainda não foi confirmado na fonte. Abra a fonte e confira antes de aprovar.</div>}
              {["rejeitar", "inconclusivo", "recoleta"].includes(modo) && (
                <div className="pilha">
                  <div className="campo"><label htmlFor="cd-motivo">Motivo {modo !== "recoleta" ? "(obrigatório)" : ""}</label>
                    <textarea id="cd-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
                  <div><button className={modo === "rejeitar" ? "botao botao-perigo" : "botao"} disabled={ocupado}
                    onClick={() => decidir(modo === "rejeitar" ? "rejeitar" : modo === "inconclusivo" ? "inconclusivo" : "recoleta", { motivo }, "Decisão registrada.")}>Confirmar</button></div>
                </div>
              )}
              {modo === "vincular" && (
                <div className="campos">
                  <div><label htmlFor="cd-vinc">ID da iniciativa existente</label><input id="cd-vinc" type="number" value={vincularId} onChange={(e) => setVincularId(e.target.value)} /></div>
                  <div><button className="botao" disabled={!vincularId || ocupado} onClick={() => decidir("vincular", { iniciativa_id: Number(vincularId), motivo: motivo || undefined }, "Evidência vinculada à iniciativa.")}>Vincular</button></div>
                </div>
              )}
              {modo === "editar" && (
                <FormIniciativa modo="aprovar" universidadeId={c.universidade_id} ocupado={ocupado}
                  iniciais={{
                    nome: c.nome, descricao: d.descricao ?? null, objetivos: d.objetivos ?? null, unidade_responsavel: d.unidade_responsavel ?? null,
                    categoria_principal: c.categoria_sugerida, categorias_secundarias: (d.categorias_secundarias ?? []).filter((x: string) => x !== c.categoria_sugerida),
                    publicos: (d.publico_alvo ?? []).filter((p: string) => p in PUBLICOS), modalidade: d.modalidade ?? null, abrangencia: d.abrangencia ?? null,
                    situacao_documentada: ["ativa", "encerrada"].includes(d.situacao_aparente) ? d.situacao_aparente : "desconhecida",
                    grau_evidencia: c.grau_evidencia_sugerido, documentos_ids: [], limitacoes: c.campos_ausentes?.length ? `Informações não localizadas na fonte: ${c.campos_ausentes.join(", ")}.` : null,
                  }}
                  aoEnviar={(v) => { const { evidencias, universidade_id, justificativa, ...edicoes } = v; void aprovar(edicoes); }} />
              )}
            </section>
          )}
        </div>
      )}
    </Estado>
  );
}
