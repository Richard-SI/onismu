import { Link, useParams } from "react-router-dom";
import { qs, useApi } from "../api";
import { Estado, SeloCategoria, SeloDemo, SeloGrau, SeloSituacao, useTitulo } from "../componentes/base";
import { ReportarErro } from "../componentes/ReportarErro";
import { useDemo } from "../contexto";
import { CATEGORIAS, CATEGORIAS_ADM, ORDEM_CATEGORIAS, SITUACOES_PESQUISA, TIPOS_DOCUMENTO, TIPOS_FONTE, UFS, fmtData, fmtNum, rotulo } from "../rotulos";

const EXPLICACAO: Record<string, string> = {
  nao_pesquisada: "Esta universidade ainda não passou pelo procedimento de pesquisa documental.",
  em_pesquisa: "Há uma coleta em andamento; os resultados ainda não foram revisados.",
  aguardando_validacao: "A coleta foi realizada e seus resultados aguardam revisão por pesquisador(a). Somente o que já foi validado aparece abaixo.",
  concluida_com_iniciativas: "A pesquisa documental foi concluída e identificou ao menos uma iniciativa validada.",
  concluida_sem_iniciativas: "A pesquisa documental foi concluída sem localizar iniciativas nas fontes consultadas. Isso NÃO significa que a universidade não possua iniciativas.",
  inconclusiva: "A pesquisa não pôde ser concluída (fontes insuficientes, inacessíveis ou contraditórias).",
};

export function Universidade() {
  const { id } = useParams();
  const demo = useDemo();
  const { dados: u, erro, carregando } = useApi<any>(`/api/publico/universidades/${id}${qs({ demo })}`);
  useTitulo(u?.sigla ?? u?.nome_oficial ?? "Universidade");
  const porCategoria = (cat: string) => (u?.iniciativas ?? []).filter((i: any) => i.categoria_principal === cat);

  return (
    <Estado erro={erro} carregando={carregando && !u}>
      {u && (
        <div className="pilha">
          <nav className="muito-discreto"><Link to="/universidades">Universidades</Link> › {u.sigla ?? u.nome_oficial}</nav>
          <div>
            <h1>{u.nome_oficial}{u.sigla ? ` (${u.sigla})` : ""}</h1>
            <div className="linha"><SeloSituacao situacao={u.situacao_pesquisa} /><SeloDemo origem={u.origem_dados} /></div>
          </div>
          <div className="grade grade-2">
            <section className="cartao">
              <h2>Identificação</h2>
              <dl className="dl">
                <dt>Categoria administrativa</dt><dd>{rotulo(CATEGORIAS_ADM, u.categoria_administrativa)}{u.subcategoria ? ` · ${u.subcategoria}` : ""}</dd>
                <dt>Localização (sede)</dt><dd>{u.municipio ?? "—"} — {UFS[u.estado]} · Região {u.regiao}</dd>
                <dt>Código e-MEC/INEP</dt><dd>{u.codigo_institucional ?? "—"}</dd>
                <dt>Site oficial</dt><dd>{u.site_oficial ? <a href={u.site_oficial} rel="noopener noreferrer" target="_blank">{u.site_oficial}</a> : "não informado na fonte de cadastro"}</dd>
                <dt>Fonte do cadastro</dt><dd className="muito-discreto">{u.fonte_cadastro}</dd>
                {u.campi.length > 0 && <><dt>Campi</dt><dd>{u.campi.map((c: any) => c.nome).join(", ")}</dd></>}
              </dl>
            </section>
            <section className="cartao">
              <h2>Situação da pesquisa</h2>
              <p><strong>{SITUACOES_PESQUISA[u.situacao_pesquisa]}.</strong> {EXPLICACAO[u.situacao_pesquisa]}</p>
              <dl className="dl">
                <dt>Última verificação</dt><dd>{fmtData(u.data_ultima_verificacao)}</dd>
                <dt>Fontes consultadas</dt><dd>{fmtNum(u.coleta.fontes_consultadas)}</dd>
                <dt>Execuções de coleta</dt><dd>{fmtNum(u.coleta.execucoes_concluidas)}</dd>
                <dt>Iniciativas validadas</dt><dd>{fmtNum(u.iniciativas.length)}</dd>
              </dl>
              {u.pendencias.length > 0 && (<><h3 style={{ marginTop: 12 }}>Pendências de cobertura</h3><ul>{u.pendencias.map((p: string) => <li key={p}>{p}</li>)}</ul></>)}
            </section>
          </div>

          <section>
            <h2>Iniciativas validadas</h2>
            {u.iniciativas.length === 0 ? <div className="vazio">Nenhuma iniciativa validada até o momento.</div> : (
              <div className="grade grade-2">
                {ORDEM_CATEGORIAS.filter((c) => porCategoria(c).length).map((c) => (
                  <div key={c} className="cartao">
                    <h3><SeloCategoria codigo={c} /> <span className="muito-discreto">{porCategoria(c).length}</span></h3>
                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                      {porCategoria(c).map((i: any) => (
                        <li key={i.id} style={{ marginBottom: 6 }}>
                          <Link to={`/iniciativas/${i.id}`}>{i.nome}</Link> <SeloGrau grau={i.grau_evidencia} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p style={{ marginTop: 12 }}><Link to={`/iniciativas?universidade_id=${u.id}`}>Abrir no catálogo com filtros</Link></p>
          </section>

          <section>
            <h2>Documentos oficiais</h2>
            {u.documentos.length === 0 ? <p className="discreto">Nenhum documento vinculado a iniciativas validadas.</p> : (
              <div className="tabela-rolagem"><table>
                <thead><tr><th>Documento</th><th>Tipo</th><th>Número</th><th>Publicação</th><th>Órgão emissor</th></tr></thead>
                <tbody>{u.documentos.map((d: any) => (
                  <tr key={d.id}>
                    <td>{d.url_original ? <a href={d.url_original} target="_blank" rel="noopener noreferrer">{d.titulo}</a> : d.titulo}</td>
                    <td>{rotulo(TIPOS_DOCUMENTO, d.tipo_documento)}{d.normativo ? " (normativo)" : ""}</td>
                    <td>{d.numero_documento ?? "—"}</td><td>{fmtData(d.data_publicacao)}</td><td>{d.orgao_emissor ?? "—"}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </section>

          <section>
            <h2>Fontes</h2>
            {u.fontes.length === 0 ? <p className="discreto">Nenhuma fonte vinculada a iniciativas validadas.</p> : (
              <ul>{u.fontes.map((f: any) => (
                <li key={f.id}><a href={f.url_original} target="_blank" rel="noopener noreferrer">{f.titulo ?? f.url_original}</a>{" "}
                  <span className="muito-discreto">· {rotulo(TIPOS_FONTE, f.tipo_fonte)} · consultada em {fmtData(f.data_consulta)}</span></li>
              ))}</ul>
            )}
          </section>
          <ReportarErro tipo="universidade" id={u.id} />
          <p className="muito-discreto">As categorias seguem a taxonomia do observatório: {Object.values(CATEGORIAS).join("; ")}.</p>
        </div>
      )}
    </Estado>
  );
}
