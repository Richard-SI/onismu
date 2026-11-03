import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { qs, useApi } from "../api";
import { Estado, SeloSituacao, useTitulo } from "../componentes/base";
import { BarrasEmpilhadas } from "../componentes/graficos";
import { useDemo } from "../contexto";
import { ABRANGENCIAS, CATEGORIAS, CATEGORIAS_ADM, COR_CATEGORIA, ORDEM_CATEGORIAS, PUBLICOS, SITUACOES_PESQUISA, fmtData, fmtNum, rotulo } from "../rotulos";

const ESTADOS_SEM_DADOS: Record<string, string> = {
  nao_pesquisada: "Não pesquisada — ausência de dados não indica ausência de iniciativas.",
  em_pesquisa: "Coleta em andamento — dados ainda não revisados.",
  aguardando_validacao: "Aguardando validação — apenas registros já validados são comparados.",
  inconclusiva: "Busca inconclusiva — fontes insuficientes ou inacessíveis.",
  concluida_sem_iniciativas: "Nenhuma iniciativa localizada nas fontes consultadas (não significa inexistência).",
};

export function Comparador() {
  useTitulo("Comparador");
  const demo = useDemo();
  const [sp, setSp] = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean);
  const [busca, setBusca] = useState("");
  const { dados: opcoes } = useApi<any>(busca.trim().length >= 2 ? `/api/publico/universidades${qs({ q: busca, por_pagina: 10, demo })}` : null);
  const { dados, erro, carregando } = useApi<any[]>(ids.length >= 2 ? `/api/publico/comparar${qs({ ids, demo })}` : null);
  const { dados: nomes } = useApi<any>(ids.length ? `/api/publico/universidades${qs({ por_pagina: 200, demo })}` : null);
  const definirIds = (n: string[]) => { const p = new URLSearchParams(sp); if (n.length) p.set("ids", n.join(",")); else p.delete("ids"); setSp(p, { replace: true }); };
  const nomeDe = (id: string) => dados?.find((u) => String(u.id) === id)?.sigla ?? nomes?.itens?.find((u: any) => String(u.id) === id)?.sigla ?? `#${id}`;

  return (
    <div className="pilha">
      <h1>Comparador de universidades</h1>
      <p className="discreto">Compare de 2 a 8 universidades. A comparação é descritiva: não há ranking de qualidade ou efetividade, e a quantidade de
        iniciativas reflete o que foi documentado e validado nas fontes públicas consultadas.</p>
      <section className="cartao nao-imprimir">
        <div className="campos">
          <div>
            <label htmlFor="cmp-busca">Adicionar universidade</label>
            <input id="cmp-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite nome ou sigla (mín. 2 letras)" />
          </div>
        </div>
        {opcoes?.itens?.length > 0 && (
          <ul className="chips" style={{ listStyle: "none", padding: 0, marginTop: 8 }} aria-label="Resultados">
            {opcoes.itens.filter((u: any) => !ids.includes(String(u.id))).map((u: any) => (
              <li key={u.id}><button className="chip" disabled={ids.length >= 8} onClick={() => { definirIds([...ids, String(u.id)]); setBusca(""); }}>
                + {u.sigla ? `${u.sigla} — ` : ""}{u.nome_oficial} ({u.estado})</button></li>
            ))}
          </ul>
        )}
        {ids.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <label>Selecionadas ({ids.length}/8)</label>
            <div className="chips">{ids.map((id) => <button key={id} className="chip" aria-pressed="true" onClick={() => definirIds(ids.filter((x) => x !== id))} aria-label={`Remover ${nomeDe(id)}`}>{nomeDe(id)} ✕</button>)}</div>
          </div>
        )}
      </section>

      {ids.length < 2 ? <div className="vazio">Selecione ao menos duas universidades para comparar.</div> : (
        <Estado erro={erro} carregando={carregando && !dados}>
          {dados && (
            <div className={`pilha ${carregando ? "carregando" : ""}`}>
              {dados.some((u) => u.situacao_pesquisa !== "concluida_com_iniciativas") && (
                <div className="aviso" role="note">
                  <strong>Atenção às situações de pesquisa:</strong>
                  <ul style={{ margin: "6px 0 0" }}>
                    {dados.filter((u) => ESTADOS_SEM_DADOS[u.situacao_pesquisa]).map((u) => <li key={u.id}><strong>{u.sigla ?? u.nome_oficial}:</strong> {ESTADOS_SEM_DADOS[u.situacao_pesquisa]}</li>)}
                  </ul>
                </div>
              )}
              <BarrasEmpilhadas titulo="Iniciativas validadas por categoria"
                subtitulo="Contagem por categoria principal; cores fixas por categoria"
                series={ORDEM_CATEGORIAS.map((c) => ({ chave: c, nome: CATEGORIAS[c], cor: COR_CATEGORIA[c] }))}
                linhas={dados.map((u) => ({ rotulo: u.sigla ?? u.nome_oficial.slice(0, 20), ...Object.fromEntries(ORDEM_CATEGORIAS.map((c) => [c, u.por_categoria[c] ?? 0])) }))} />
              <div className="tabela-rolagem">
                <table>
                  <caption>Quadro comparativo</caption>
                  <thead><tr><th>Aspecto</th>{dados.map((u) => <th key={u.id}><Link to={`/universidades/${u.id}`}>{u.sigla ?? u.nome_oficial}</Link></th>)}</tr></thead>
                  <tbody>
                    <tr><td>Categoria administrativa</td>{dados.map((u) => <td key={u.id}>{rotulo(CATEGORIAS_ADM, u.categoria_administrativa)}</td>)}</tr>
                    <tr><td>Localização</td>{dados.map((u) => <td key={u.id}>{u.municipio ?? "—"}/{u.estado} · {u.regiao}</td>)}</tr>
                    <tr><td>Situação da pesquisa</td>{dados.map((u) => <td key={u.id}><SeloSituacao situacao={u.situacao_pesquisa} /><div className="muito-discreto">{SITUACOES_PESQUISA[u.situacao_pesquisa]}</div></td>)}</tr>
                    <tr><td>Iniciativas validadas</td>{dados.map((u) => <td key={u.id} className="num">{fmtNum(u.iniciativas_validadas)}</td>)}</tr>
                    {ORDEM_CATEGORIAS.map((c) => (
                      <tr key={c}><td>· {CATEGORIAS[c]}</td>{dados.map((u) => <td key={u.id} className="num">{fmtNum(u.por_categoria[c] ?? 0)}</td>)}</tr>
                    ))}
                    <tr><td>Políticas formalizadas (Nível 1)</td>{dados.map((u) => <td key={u.id} className="num">{fmtNum(u.politicas_formalizadas)}</td>)}</tr>
                    <tr><td>Públicos atendidos</td>{dados.map((u) => <td key={u.id}>{u.publicos.length ? u.publicos.map((p: string) => rotulo(PUBLICOS, p)).join(", ") : "—"}</td>)}</tr>
                    <tr><td>Abrangência</td>{dados.map((u) => <td key={u.id}>{Object.keys(u.abrangencia).length ? Object.entries(u.abrangencia).map(([k, n]) => `${k === "nao_informada" ? "Não informada" : rotulo(ABRANGENCIAS, k)}: ${n}`).join("; ") : "—"}</td>)}</tr>
                    <tr><td>Documentos vinculados</td>{dados.map((u) => <td key={u.id} className="num">{fmtNum(u.documentos)}</td>)}</tr>
                    <tr><td>Fontes com evidência</td>{dados.map((u) => <td key={u.id} className="num">{fmtNum(u.fontes)}</td>)}</tr>
                    <tr><td>Execuções de coleta</td>{dados.map((u) => <td key={u.id} className="num">{fmtNum(u.execucoes_coleta)}</td>)}</tr>
                    <tr><td>Última verificação</td>{dados.map((u) => <td key={u.id}>{fmtData(u.data_ultima_verificacao)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Estado>
      )}
    </div>
  );
}
