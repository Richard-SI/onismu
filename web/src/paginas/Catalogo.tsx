import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { qs, useApi } from "../api";
import { BotoesExportacao, Chips, Estado, Paginacao, SeloCategoria, SeloDemo, SeloGrau, useTitulo } from "../componentes/base";
import { lista } from "../componentes/FiltrosUniverso";
import { useDemo } from "../contexto";
import {
  ATUALIDADE, CATEGORIAS, CATEGORIAS_ADM, PUBLICOS, REGIOES, SITUACOES_DOC, UFS, fmtData, rotulo,
} from "../rotulos";

const CHAVES_LISTA = ["regiao", "estado", "categoria", "publico", "situacao_documentada", "grau_evidencia", "categoria_administrativa", "universidade_id"];

export function Catalogo() {
  useTitulo("Catálogo de iniciativas");
  const [sp, setSp] = useSearchParams();
  const demo = useDemo();
  const [texto, setTexto] = useState(sp.get("q") ?? "");
  const f: Record<string, any> = Object.fromEntries(CHAVES_LISTA.map((k) => [k, lista(sp, k)]));
  const pagina = Number(sp.get("pagina") ?? 1);
  const parametros = {
    ...f, q: sp.get("q") ?? undefined, ordenar: sp.get("ordenar") ?? undefined, demo,
    tem_documento_normativo: sp.get("tem_documento_normativo") ?? undefined,
    incluir_secundarias: sp.get("incluir_secundarias") ?? undefined,
  };
  const { dados, erro, carregando } = useApi<any>(`/api/publico/iniciativas${qs({ ...parametros, pagina, por_pagina: 20 })}`);
  const { dados: unis } = useApi<any>(f.universidade_id.length ? `/api/publico/universidades${qs({ por_pagina: 200, demo })}` : null);

  const definir = (k: string, v: string | string[] | null) => {
    const n = new URLSearchParams(sp);
    const val = Array.isArray(v) ? v.join(",") : v;
    if (val) n.set(k, val); else n.delete(k);
    if (k !== "pagina") n.delete("pagina");
    setSp(n, { replace: k !== "pagina" });
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== texto) definir("q", texto.trim() || null); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  const filtrosAtivos = CHAVES_LISTA.some((k) => f[k].length) || sp.get("q") || sp.get("tem_documento_normativo");

  return (
    <div className="pilha">
      <div className="linha entre">
        <div>
          <h1>Catálogo de iniciativas</h1>
          <p className="discreto">Somente iniciativas validadas por pesquisadores, cada uma com fonte e trecho comprobatório.</p>
        </div>
        <BotoesExportacao tipo="iniciativas" params={qs(parametros)} rotulo="Exportar resultados filtrados" />
      </div>
      <div className="layout-filtros">
        <aside className="cartao painel-filtros nao-imprimir" aria-label="Filtros do catálogo">
          <div className="campo">
            <label htmlFor="c-q">Pesquisa por texto</label>
            <input id="c-q" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="nome, descrição, universidade…" />
          </div>
          <div className="campo"><label>Categoria principal</label>
            <Chips rotuloGrupo="Categoria" opcoes={CATEGORIAS} selecionados={f.categoria} aoMudar={(v) => definir("categoria", v)} />
            <label className="linha" style={{ fontWeight: 400, marginTop: 6 }}>
              <input type="checkbox" checked={sp.get("incluir_secundarias") === "true"} onChange={(e) => definir("incluir_secundarias", e.target.checked ? "true" : null)} />
              incluir categorias secundárias
            </label>
          </div>
          <div className="campo"><label>Região</label>
            <Chips rotuloGrupo="Região" opcoes={Object.fromEntries(REGIOES.map((r) => [r, r]))} selecionados={f.regiao} aoMudar={(v) => definir("regiao", v)} />
          </div>
          <div className="campo"><label htmlFor="c-uf">Estado</label>
            <select id="c-uf" value={f.estado.length === 1 ? f.estado[0] : ""} onChange={(e) => definir("estado", e.target.value || null)}>
              <option value="">{f.estado.length > 1 ? f.estado.join(", ") : "Todos"}</option>
              {Object.entries(UFS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="campo"><label>Público-alvo</label>
            <Chips rotuloGrupo="Público-alvo" opcoes={PUBLICOS} selecionados={f.publico} aoMudar={(v) => definir("publico", v)} />
          </div>
          <div className="campo"><label>Nível de evidência</label>
            <Chips rotuloGrupo="Nível de evidência" opcoes={{ 1: "Nível 1", 2: "Nível 2", 3: "Nível 3", 4: "Nível 4" }} selecionados={f.grau_evidencia} aoMudar={(v) => definir("grau_evidencia", v)} />
          </div>
          <div className="campo"><label htmlFor="c-doc">Documento normativo</label>
            <select id="c-doc" value={sp.get("tem_documento_normativo") ?? ""} onChange={(e) => definir("tem_documento_normativo", e.target.value || null)}>
              <option value="">Indiferente</option><option value="true">Com documento normativo</option><option value="false">Sem documento normativo</option>
            </select>
          </div>
          <div className="campo"><label>Situação documentada</label>
            <Chips rotuloGrupo="Situação documentada" opcoes={SITUACOES_DOC} selecionados={f.situacao_documentada} aoMudar={(v) => definir("situacao_documentada", v)} />
          </div>
          <div className="campo"><label htmlFor="c-cat">Categoria administrativa</label>
            <select id="c-cat" value={f.categoria_administrativa[0] ?? ""} onChange={(e) => definir("categoria_administrativa", e.target.value || null)}>
              <option value="">Todas</option>
              {Object.entries(CATEGORIAS_ADM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {f.universidade_id.length > 0 && (
            <div className="campo">
              <label>Universidade</label>
              <span className="chips">{f.universidade_id.map((id: string) => (
                <button key={id} className="chip" aria-pressed="true" onClick={() => definir("universidade_id", f.universidade_id.filter((x: string) => x !== id))}>
                  {unis?.itens?.find((u: any) => String(u.id) === id)?.sigla ?? `#${id}`} ✕
                </button>
              ))}</span>
            </div>
          )}
          {filtrosAtivos && <button className="botao botao-sec botao-peq" onClick={() => { setTexto(""); setSp(new URLSearchParams(), { replace: true }); }}>Limpar todos os filtros</button>}
        </aside>

        <section aria-live="polite" aria-busy={carregando}>
          <div className="linha entre" style={{ marginBottom: 12 }}>
            <span className="discreto">{dados ? `${dados.total.toLocaleString("pt-BR")} iniciativa(s) encontrada(s)` : ""}</span>
            <span className="linha">
              <label htmlFor="c-ord" style={{ margin: 0 }}>Ordenar por</label>
              <select id="c-ord" style={{ width: "auto" }} value={sp.get("ordenar") ?? "universidade"} onChange={(e) => definir("ordenar", e.target.value)}>
                <option value="universidade">Universidade</option><option value="nome">Nome da iniciativa</option>
                <option value="grau">Nível de evidência</option><option value="recentes">Validadas recentemente</option>
              </select>
            </span>
          </div>
          <Estado erro={erro} carregando={carregando && !dados} vazio={dados?.total === 0}>
            {dados && (
              <div className={carregando ? "carregando" : ""}>
                <ul className="lista-iniciativas">
                  {dados.itens.map((i: any) => (
                    <li key={i.id} className="item-iniciativa">
                      <div className="linha" style={{ gap: 6, marginBottom: 6 }}>
                        <SeloCategoria codigo={i.categoria_principal} /><SeloGrau grau={i.grau_evidencia} />
                        {i.tem_documento_normativo && <span className="selo">Com documento normativo</span>}
                        <SeloDemo origem={i.origem_dados} />
                      </div>
                      <h3><Link to={`/iniciativas/${i.id}`}>{i.nome}</Link></h3>
                      <div className="discreto" style={{ fontSize: "0.9rem" }}>
                        <Link to={`/universidades/${i.universidade_id}`}>{i.universidade_sigla ?? i.universidade_nome}</Link> · {i.estado} · {i.regiao}
                        {i.unidade_responsavel ? ` · ${i.unidade_responsavel}` : ""}
                      </div>
                      {i.descricao && <p>{i.descricao.length > 260 ? i.descricao.slice(0, 259) + "…" : i.descricao}</p>}
                      <div className="muito-discreto" style={{ marginTop: 6 }}>
                        {i.publicos.length ? `Público: ${i.publicos.map((p: string) => rotulo(PUBLICOS, p)).join(", ")} · ` : ""}
                        {rotulo(SITUACOES_DOC, i.situacao_documentada)} · {rotulo(ATUALIDADE, i.atualidade_fonte)} · {i.n_evidencias} evidência(s) · verificada em {fmtData(i.data_ultima_verificacao)}
                      </div>
                    </li>
                  ))}
                </ul>
                <Paginacao pagina={dados.pagina} totalPaginas={dados.total_paginas} total={dados.total} aoMudar={(p) => definir("pagina", String(p))} />
              </div>
            )}
          </Estado>
        </section>
      </div>
    </div>
  );
}
