import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, qs, useApi } from "../../api";
import { Estado, SeloSituacao, SeloVerificacao, useTitulo } from "../../componentes/base";
import { CATEGORIAS, GRAUS, STATUS_CANDIDATO, TIPOS_FONTE, rotulo } from "../../rotulos";

/**
 * Validação simplificada: uma universidade por vez, cada candidato com fonte, trecho e conferência,
 * ajuste rápido de categoria/nível e decisão em um clique. Casos complexos abrem a revisão completa.
 */
export function Validacao() {
  useTitulo("Validação");
  const [sp, setSp] = useSearchParams();
  const { dados: unis, recarregar: recarregarUnis } = useApi<any>("/api/admin/validacao/universidades");
  const uid = sp.get("universidade") ?? (unis?.itens?.find((u: any) => u.pendentes > 0)?.id?.toString() ?? null);
  const [mostrar, setMostrar] = useState<"pendente" | "decididos">("pendente");
  const status = mostrar === "pendente" ? ["pendente"] : ["aprovado", "vinculado", "rejeitado", "inconclusivo", "recoleta_solicitada"];
  const { dados: lista, erro, recarregar } = useApi<any>(uid ? `/api/admin/candidatos${qs({ universidade_id: uid, status, por_pagina: 200 })}` : null);
  const uni = unis?.itens?.find((u: any) => String(u.id) === uid);
  const atualizar = () => { void recarregar(); void recarregarUnis(); };

  return (
    <div className="pilha">
      <div>
        <h1>Validação</h1>
        <p className="discreto">Confira a fonte e o trecho de cada candidato e decida. Só o que for aprovado aparece no catálogo público, com a fonte como evidência.
          Para editar todos os campos ou vincular a uma iniciativa existente, use “Revisão completa”.</p>
      </div>
      <nav className="chips" aria-label="Universidades com candidatos">
        {(unis?.itens ?? []).map((u: any) => (
          <button key={u.id} className="chip" aria-pressed={String(u.id) === uid}
            onClick={() => { const n = new URLSearchParams(sp); n.set("universidade", String(u.id)); setSp(n, { replace: true }); }}>
            {u.sigla ?? u.nome_oficial} {u.pendentes > 0 ? `· ${u.pendentes} pendente(s)` : "· ✓"}
          </button>
        ))}
      </nav>
      {uni && (
        <section className="cartao">
          <div className="linha entre">
            <div>
              <h2 style={{ margin: 0 }}>{uni.nome_oficial}</h2>
              <div className="linha" style={{ marginTop: 6 }}>
                <SeloSituacao situacao={uni.situacao_pesquisa} />
                <span className="muito-discreto">{uni.pendentes} pendentes · {uni.aprovados} aprovados · {uni.rejeitados} rejeitados · {uni.outros} inconclusivos/nova coleta · {uni.iniciativas_validadas} iniciativas publicadas</span>
              </div>
            </div>
            <div className="linha">
              <Link to={`/universidades/${uni.id}`}>Página pública</Link>
              <Link to={`/admin/universidades/${uni.id}`}>Gestão da universidade</Link>
            </div>
          </div>
          {uni.pendentes === 0 && <ConcluirPesquisa universidadeId={uni.id} aoConcluir={atualizar} situacao={uni.situacao_pesquisa} />}
        </section>
      )}
      {uid && (
        <div className="abas" role="tablist">
          <button role="tab" aria-selected={mostrar === "pendente"} onClick={() => setMostrar("pendente")}>Pendentes</button>
          <button role="tab" aria-selected={mostrar === "decididos"} onClick={() => setMostrar("decididos")}>Já decididos</button>
        </div>
      )}
      <Estado erro={erro} carregando={!!uid && !lista} vazio={lista?.itens?.length === 0}>
        {!uid && unis && <div className="vazio">Nenhum candidato na fila.</div>}
        {lista?.itens?.map((c: any) => <CartaoCandidato key={c.id} c={c} aoDecidir={atualizar} />)}
      </Estado>
    </div>
  );
}

function CartaoCandidato({ c, aoDecidir }: { c: any; aoDecidir: () => void }) {
  const [categoria, setCategoria] = useState(c.categoria_sugerida);
  const [grau, setGrau] = useState<number>(c.grau_evidencia_sugerido);
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState<"" | "rejeitar" | "inconclusivo">("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setCategoria(c.categoria_sugerida); setGrau(c.grau_evidencia_sugerido); }, [c.id, c.categoria_sugerida, c.grau_evidencia_sugerido]);
  const pendente = c.status === "pendente";

  const decidir = async (acao: "aprovar" | "rejeitar" | "inconclusivo") => {
    setOcupado(true); setMsg(null);
    try {
      const corpo = acao === "aprovar"
        ? { edicoes: { ...(categoria !== c.categoria_sugerida ? { categoria_principal: categoria } : {}), ...(grau !== c.grau_evidencia_sugerido ? { grau_evidencia: grau } : {}) },
            justificativa: motivo || undefined }
        : { motivo };
      await api(`/api/admin/candidatos/${c.id}/${acao}`, { corpo });
      setMsg({ ok: true, texto: acao === "aprovar" ? "Aprovado e publicado." : "Decisão registrada." });
      aoDecidir();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    } finally { setOcupado(false); }
  };

  return (
    <article className="cartao" aria-label={c.nome}>
      <div className="linha entre" style={{ alignItems: "flex-start" }}>
        <h3 style={{ margin: 0 }}>{c.nome}</h3>
        <span className="muito-discreto">#{c.id} · {c.execucao}</span>
      </div>
      <p style={{ margin: "6px 0" }}>
        <a href={c.url_fonte} target="_blank" rel="noopener noreferrer">{c.titulo_fonte ?? c.url_fonte}</a>{" "}
        <span className="muito-discreto">· {rotulo(TIPOS_FONTE, c.tipo_fonte)} · confiança {c.confianca}</span>
      </p>
      <blockquote className="citacao">“{c.trecho_evidencia}”</blockquote>
      <div className="linha"><SeloVerificacao v={c.verificacao_trecho} />
        {c.n_duplicatas > 0 && <span className="selo selo-alerta">Possível duplicata: {c.possiveis_duplicatas.map((d: any) => `${d.nome} (${d.tipo} #${d.id})`).join("; ")}</span>}
      </div>
      {c.descricao && <p className="discreto" style={{ marginTop: 8 }}>{c.descricao}</p>}
      {c.justificativa && <p className="muito-discreto">Justificativa da sugestão: {c.justificativa}</p>}

      {pendente ? (
        <div className="pilha" style={{ marginTop: 12 }}>
          <div className="campos">
            <div><label htmlFor={`cat-${c.id}`}>Categoria</label>
              <select id={`cat-${c.id}`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}{k === c.categoria_sugerida ? " (sugerida)" : ""}</option>)}
              </select></div>
            <div><label htmlFor={`grau-${c.id}`}>Nível de evidência</label>
              <select id={`grau-${c.id}`} value={grau} onChange={(e) => setGrau(Number(e.target.value))}>
                {[1, 2, 3, 4].map((g) => <option key={g} value={g}>{GRAUS[g]}{g === c.grau_evidencia_sugerido ? " (sugerido)" : ""}</option>)}
              </select></div>
          </div>
          {grau === 1 && <div className="aviso">O Nível 1 exige documento normativo vinculado; se o candidato não trouxer um, use a revisão completa para vincular.</div>}
          {modo && (
            <div className="campo"><label htmlFor={`mot-${c.id}`}>Motivo (obrigatório)</label>
              <textarea id={`mot-${c.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={modo === "rejeitar" ? "ex.: não é iniciativa da universidade; trecho não comprova" : "ex.: fonte antiga, situação atual incerta"} /></div>
          )}
          <div className="linha">
            {!modo && <>
              <button className="botao" disabled={ocupado} onClick={() => decidir("aprovar")}>Aprovar{categoria !== c.categoria_sugerida || grau !== c.grau_evidencia_sugerido ? " com ajustes" : ""}</button>
              <button className="botao botao-sec" disabled={ocupado} onClick={() => setModo("inconclusivo")}>Inconclusivo</button>
              <button className="botao botao-perigo" disabled={ocupado} onClick={() => setModo("rejeitar")}>Rejeitar</button>
            </>}
            {modo && <>
              <button className={modo === "rejeitar" ? "botao botao-perigo" : "botao"} disabled={ocupado || motivo.trim().length < 3} onClick={() => decidir(modo)}>Confirmar {modo === "rejeitar" ? "rejeição" : "inconclusivo"}</button>
              <button className="botao botao-sec" onClick={() => { setModo(""); setMotivo(""); }}>Cancelar</button>
            </>}
            <Link className="botao botao-sec" to={`/admin/revisao/${c.id}`}>Revisão completa</Link>
          </div>
        </div>
      ) : (
        <p style={{ marginTop: 8 }}><strong>{rotulo(STATUS_CANDIDATO, c.status)}</strong>{c.motivo_decisao ? ` — ${c.motivo_decisao}` : ""}</p>
      )}
      {msg && <div className={msg.ok ? "sucesso" : "erro"} role={msg.ok ? "status" : "alert"} style={{ marginTop: 8 }}>{msg.texto}</div>}
    </article>
  );
}

function ConcluirPesquisa({ universidadeId, situacao, aoConcluir }: { universidadeId: number; situacao: string; aoConcluir: () => void }) {
  const [justificativa, setJustificativa] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  if (situacao.startsWith("concluida")) return <p className="muito-discreto" style={{ marginTop: 8 }}>Pesquisa encerrada. Para reabrir, use a gestão da universidade.</p>;
  const enviar = async (acao: "concluir" | "inconclusiva") => {
    try {
      const r = await api<any>(`/api/admin/universidades/${universidadeId}/situacao`, { corpo: { acao, justificativa } });
      setMsg({ ok: true, texto: `Situação atualizada: ${r.situacao_pesquisa}.` }); aoConcluir();
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }); }
  };
  return (
    <div className="pilha" style={{ marginTop: 12 }}>
      <div className="aviso">Todos os candidatos desta universidade foram decididos. Encerre a pesquisa para que ela entre nos indicadores de cobertura.</div>
      <div className="campos">
        <div><label htmlFor="cp-just">Justificativa</label><input id="cp-just" type="text" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="ex.: fontes oficiais revisadas em 23/10/2026" /></div>
        <div className="linha">
          <button className="botao" disabled={justificativa.length < 5} onClick={() => enviar("concluir")}>Concluir pesquisa</button>
          <button className="botao botao-sec" disabled={justificativa.length < 5} onClick={() => enviar("inconclusiva")}>Declarar inconclusiva</button>
        </div>
      </div>
      {msg && <div className={msg.ok ? "sucesso" : "erro"}>{msg.texto}</div>}
    </div>
  );
}
