import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { qs, useApi } from "../api";
import { BotoesExportacao, Chips, Estado, Paginacao, SeloDemo, SeloSituacao, useTitulo } from "../componentes/base";
import { FiltrosUniverso, lista, useFiltrosUniverso } from "../componentes/FiltrosUniverso";
import { useDemo } from "../contexto";
import { CATEGORIAS_ADM, SITUACOES_CURTAS, fmtData, fmtNum, rotulo } from "../rotulos";

export function Universidades() {
  useTitulo("Universidades");
  const filtros = useFiltrosUniverso();
  const [sp, setSp] = [filtros.sp, filtros.setSp];
  const demo = useDemo();
  const [texto, setTexto] = useState(sp.get("q") ?? "");
  const situacao = lista(sp, "situacao_pesquisa");
  const pagina = Number(sp.get("pagina") ?? 1);
  const params = { ...filtros.valores, situacao_pesquisa: situacao, q: sp.get("q") ?? undefined, demo };
  const { dados, erro, carregando } = useApi<any>(`/api/publico/universidades${qs({ ...params, pagina, por_pagina: 30, ordenar: sp.get("ordenar") ?? "estado" })}`);
  const definir = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    if (k !== "pagina") n.delete("pagina");
    setSp(n, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") ?? "") !== texto) definir("q", texto.trim() || null); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="pilha">
      <div className="linha entre">
        <div>
          <h1>Universidades — matriz de cobertura</h1>
          <p className="discreto">Todas as universidades do universo institucional, inclusive as ainda não pesquisadas.</p>
        </div>
        <BotoesExportacao tipo="universidades" params={qs(params)} />
      </div>
      <FiltrosUniverso {...filtros} />
      <div className="cartao campos">
        <div>
          <label htmlFor="u-q">Buscar universidade</label>
          <input id="u-q" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="nome, sigla ou município" />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label>Situação da pesquisa</label>
          <Chips rotuloGrupo="Situação da pesquisa" opcoes={SITUACOES_CURTAS} selecionados={situacao} aoMudar={(v) => definir("situacao_pesquisa", v.join(",") || null)} />
        </div>
      </div>
      <Estado erro={erro} carregando={carregando && !dados} vazio={dados?.total === 0}>
        {dados && (
          <div className={carregando ? "carregando" : ""}>
            <div className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    <th>Universidade</th><th>UF</th><th>Categoria administrativa</th><th>Situação da pesquisa</th>
                    <th className="num">Iniciativas validadas</th><th>Última verificação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.itens.map((u: any) => (
                    <tr key={u.id}>
                      <td><Link to={`/universidades/${u.id}`}>{u.nome_oficial}</Link>{u.sigla ? ` (${u.sigla})` : ""} <SeloDemo origem={u.origem_dados} />
                        <div className="muito-discreto">{u.municipio}</div></td>
                      <td>{u.estado}</td>
                      <td>{rotulo(CATEGORIAS_ADM, u.categoria_administrativa)}</td>
                      <td><SeloSituacao situacao={u.situacao_pesquisa} /></td>
                      <td className="num">{fmtNum(u.iniciativas_validadas)}</td>
                      <td>{fmtData(u.data_ultima_verificacao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao pagina={dados.pagina} totalPaginas={dados.total_paginas} total={dados.total} aoMudar={(p) => definir("pagina", String(p))} />
          </div>
        )}
      </Estado>
    </div>
  );
}
