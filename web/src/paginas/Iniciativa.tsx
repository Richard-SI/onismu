import { Link, useParams } from "react-router-dom";
import { qs, useApi } from "../api";
import { Estado, SeloCategoria, SeloDemo, SeloGrau, SeloVerificacao, useTitulo } from "../componentes/base";
import { ReportarErro } from "../componentes/ReportarErro";
import { useDemo } from "../contexto";
import {
  ABRANGENCIAS, ATUALIDADE, GRAUS, MODALIDADES, PUBLICOS, SITUACOES_DOC, TIPOS_DOCUMENTO, TIPOS_FONTE, fmtData, rotulo, CATEGORIAS,
} from "../rotulos";

const RELACOES: Record<string, [string, string]> = {
  vinculada_a_politica: ["Vinculada à política", "Iniciativa vinculada a esta política"],
  parte_de: ["Parte de", "Inclui"],
  relacionada: ["Relacionada a", "Relacionada a"],
};

export function Iniciativa() {
  const { id } = useParams();
  const demo = useDemo();
  const { dados: i, erro, carregando } = useApi<any>(`/api/publico/iniciativas/${id}${qs({ demo })}`);
  useTitulo(i?.nome ?? "Iniciativa");
  return (
    <Estado erro={erro} carregando={carregando && !i}>
      {i && (
        <article className="pilha">
          <nav className="muito-discreto"><Link to="/iniciativas">Catálogo</Link> › <Link to={`/universidades/${i.universidade_id}`}>{i.universidade_sigla ?? i.universidade_nome}</Link></nav>
          <header>
            <div className="linha" style={{ gap: 6, marginBottom: 8 }}>
              <SeloCategoria codigo={i.categoria_principal} /><SeloGrau grau={i.grau_evidencia} /><SeloDemo origem={i.origem_dados} />
            </div>
            <h1>{i.nome}</h1>
            <p className="discreto"><Link to={`/universidades/${i.universidade_id}`}>{i.universidade_nome}</Link> · {i.estado} · Região {i.regiao}</p>
          </header>

          <div className="grade grade-2">
            <section className="cartao">
              <h2>Descrição</h2>
              <p>{i.descricao ?? <span className="discreto">Sem descrição nas fontes consultadas.</span>}</p>
              {i.objetivos && (<><h3>Objetivos</h3><p>{i.objetivos}</p></>)}
            </section>
            <section className="cartao">
              <h2>Características documentadas</h2>
              <dl className="dl">
                <dt>Categoria principal</dt><dd>{rotulo(CATEGORIAS, i.categoria_principal)}</dd>
                {i.categorias_secundarias.length > 0 && <><dt>Categorias secundárias</dt><dd>{i.categorias_secundarias.map((c: string) => rotulo(CATEGORIAS, c)).join(", ")}</dd></>}
                <dt>Unidade responsável</dt><dd>{i.unidade_responsavel ?? "não informada na fonte"}</dd>
                <dt>Público-alvo</dt><dd>{i.publicos.length ? i.publicos.map((p: string) => rotulo(PUBLICOS, p)).join(", ") : "não informado"}</dd>
                <dt>Abrangência</dt><dd>{rotulo(ABRANGENCIAS, i.abrangencia)}{i.campus_nome ? ` · ${i.campus_nome}` : ""}</dd>
                <dt>Modalidade</dt><dd>{rotulo(MODALIDADES, i.modalidade)}</dd>
                <dt>Período</dt><dd>{i.data_inicio ? `${fmtData(i.data_inicio)}${i.data_fim ? ` a ${fmtData(i.data_fim)}` : ""}` : "não informado"}</dd>
                <dt>Situação documentada</dt><dd>{rotulo(SITUACOES_DOC, i.situacao_documentada)}</dd>
                <dt>Grau de evidência</dt><dd>{GRAUS[i.grau_evidencia]}</dd>
                <dt>Atualidade da fonte</dt><dd>{rotulo(ATUALIDADE, i.atualidade_fonte)}{i.data_ultima_evidencia ? ` (${fmtData(i.data_ultima_evidencia)})` : ""}</dd>
                <dt>Última verificação</dt><dd>{fmtData(i.data_ultima_verificacao)}</dd>
              </dl>
            </section>
          </div>

          <section>
            <h2>Evidências e fontes</h2>
            <p className="muito-discreto">Trechos copiados literalmente das fontes originais na data de consulta indicada.</p>
            {i.evidencias.map((e: any) => (
              <div key={e.id} className="cartao">
                <blockquote className="citacao">“{e.trecho_evidencia}”</blockquote>
                <div className="linha" style={{ gap: 8 }}>
                  <a href={e.url_original} target="_blank" rel="noopener noreferrer">{e.fonte_titulo ?? e.url_original}</a>
                  <span className="selo">{rotulo(TIPOS_FONTE, e.tipo_fonte)}</span>
                  <SeloVerificacao v={e.verificacao_trecho} />
                </div>
                <div className="muito-discreto" style={{ marginTop: 6 }}>
                  Consulta em {fmtData(e.data_consulta)}{e.data_publicacao ? ` · publicação da fonte: ${fmtData(e.data_publicacao)}` : ""}
                  {e.situacao_fonte !== "acessivel" ? ` · situação da fonte: ${e.situacao_fonte}` : ""}
                </div>
              </div>
            ))}
          </section>

          {i.documentos.length > 0 && (
            <section>
              <h2>Documentos</h2>
              <ul>{i.documentos.map((d: any) => (
                <li key={d.id}>{d.url_original ? <a href={d.url_original} target="_blank" rel="noopener noreferrer">{d.titulo}</a> : d.titulo}
                  {" "}<span className="muito-discreto">· {rotulo(TIPOS_DOCUMENTO, d.tipo_documento)}{d.numero_documento ? ` nº ${d.numero_documento}` : ""}{d.data_publicacao ? ` · ${fmtData(d.data_publicacao)}` : ""}{d.orgao_emissor ? ` · ${d.orgao_emissor}` : ""}</span></li>
              ))}</ul>
            </section>
          )}

          {i.relacoes.length > 0 && (
            <section>
              <h2>Relações com outras iniciativas</h2>
              <ul>{i.relacoes.map((r: any) => (
                <li key={r.id}>{(RELACOES[r.tipo] ?? [r.tipo, r.tipo])[r.direcao === "saida" ? 0 : 1]}: <Link to={`/iniciativas/${r.iniciativa_id}`}>{r.nome}</Link></li>
              ))}</ul>
              <p className="muito-discreto">Relações não alteram as contagens: cada iniciativa é contada uma única vez.</p>
            </section>
          )}

          <section className="cartao">
            <h2>Limitações</h2>
            <ul>
              {i.limitacoes && <li>{i.limitacoes}</li>}
              <li>O registro descreve o que consta nas fontes públicas consultadas; a situação atual da iniciativa pode ter mudado.</li>
              <li>O grau de evidência refere-se à documentação disponível e não avalia a qualidade ou a efetividade do cuidado.</li>
            </ul>
          </section>
          <ReportarErro tipo="iniciativa" id={i.id} />
        </article>
      )}
    </Estado>
  );
}
