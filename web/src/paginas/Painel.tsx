import { qs, useApi } from "../api";
import { AvisoCobertura, BotoesExportacao, Estado, Indicador, IndicadorPct, useTitulo } from "../componentes/base";
import { FiltrosUniverso, useFiltrosUniverso } from "../componentes/FiltrosUniverso";
import { BarrasHorizontais, TabelaSimples } from "../componentes/graficos";
import { useDemo } from "../contexto";
import { GRAUS, ORDEM_SITUACOES, SITUACOES_PESQUISA, fmtData, fmtNum, fmtPct } from "../rotulos";

export function Painel() {
  useTitulo("Painel nacional");
  const filtros = useFiltrosUniverso();
  const demo = useDemo();
  const params = qs({ ...filtros.valores, demo });
  const { dados: d, erro, carregando } = useApi<any>(`/api/publico/indicadores${params}`);

  return (
    <div className="pilha">
      <div className="linha entre">
        <div>
          <h1>Painel nacional</h1>
          <p className="discreto">Indicadores calculados diretamente da base{d ? `, com dados até ${fmtData(d.data_atualizacao)}` : ""}.</p>
        </div>
        <div className="linha">
          <BotoesExportacao tipo="indicadores" params={params} rotulo="Indicadores" />
          <a className="botao botao-sec botao-peq" href={`/api/publico/relatorio.pdf${params}`}>Relatório PDF</a>
        </div>
      </div>
      <FiltrosUniverso {...filtros} />
      <Estado erro={erro} carregando={carregando}>
        {d && (
          <div className={`pilha ${carregando ? "carregando" : ""}`}>
            <AvisoCobertura concluidas={d.concluidas} universo={d.universo} />
            <section aria-labelledby="t-cobertura">
              <h2 id="t-cobertura">Cobertura institucional</h2>
              <div className="grade grade-4">
                <Indicador rotulo="Universidades no universo" valor={fmtNum(d.universo)} base="Censo da Educação Superior (INEP)" />
                <IndicadorPct rotulo="Cobertura da pesquisa" ind={d.indicadores.cobertura_pesquisa} />
                <Indicador rotulo="Concluídas com iniciativas" valor={fmtNum(d.situacao_pesquisa.concluida_com_iniciativas)} base="pesquisa concluída e ≥ 1 iniciativa validada" />
                <Indicador rotulo="Concluídas sem iniciativas localizadas" valor={fmtNum(d.situacao_pesquisa.concluida_sem_iniciativas)} base="nada identificado nas fontes consultadas" />
                <Indicador rotulo="Busca inconclusiva" valor={fmtNum(d.situacao_pesquisa.inconclusiva)} base="fontes insuficientes ou inacessíveis" />
                <Indicador rotulo="Aguardando validação" valor={fmtNum(d.situacao_pesquisa.aguardando_validacao + d.situacao_pesquisa.em_pesquisa)} base="coleta realizada ou em curso, sem revisão final" />
                <Indicador rotulo="Ainda não pesquisadas" valor={fmtNum(d.situacao_pesquisa.nao_pesquisada)} base={`de ${fmtNum(d.universo)} universidades`} />
                <IndicadorPct rotulo="Universidades com iniciativas identificadas" ind={d.indicadores.universidades_com_iniciativas} />
              </div>
            </section>

            <section aria-labelledby="t-iniciativas">
              <h2 id="t-iniciativas">Iniciativas validadas</h2>
              <div className="grade grade-4">
                <Indicador rotulo="Total de iniciativas validadas" valor={fmtNum(d.iniciativas_validadas)} base={`${fmtNum(d.em_validacao.candidatos_pendentes)} sugestões em revisão — não incluídas`} />
                <Indicador rotulo="Políticas formalizadas (Nível 1)" valor={fmtNum(d.politicas_formalizadas)} base="política institucional com ato normativo" />
                {d.por_categoria.itens.filter((c: any) => c.categoria !== "politica_institucional").map((c: any) => (
                  <Indicador key={c.categoria} rotulo={c.nome} valor={fmtNum(c.n)} base={`${fmtPct(c.percentual)} de ${fmtNum(d.por_categoria.denominador)} iniciativas validadas`} />
                ))}
                <IndicadorPct rotulo="Cobertura documental de políticas" ind={d.indicadores.cobertura_documental_politicas} />
              </div>
            </section>

            <div className="grade grade-2">
              <BarrasHorizontais titulo="Iniciativas validadas por categoria principal"
                subtitulo={`Base: ${fmtNum(d.por_categoria.denominador)} ${d.por_categoria.rotulo_denominador}`}
                total={d.por_categoria.denominador}
                dados={d.por_categoria.itens.map((c: any) => ({ rotulo: c.nome, valor: c.n }))} />
              <BarrasHorizontais titulo="Situação da pesquisa (matriz de cobertura)" rotuloValor="Universidades"
                subtitulo={`Base: ${fmtNum(d.universo)} universidades no universo`} total={d.universo}
                dados={ORDEM_SITUACOES.map((s) => ({ rotulo: SITUACOES_PESQUISA[s], valor: d.situacao_pesquisa[s] ?? 0 }))} />
              <BarrasHorizontais titulo="Iniciativas validadas por grau de evidência"
                subtitulo="O grau mede a documentação disponível, não a qualidade do cuidado"
                total={d.iniciativas_validadas}
                dados={[1, 2, 3, 4].map((g) => ({ rotulo: GRAUS[g].replace(/ — .*/, "") + " · " + GRAUS[g].split(" — ")[1], valor: d.por_grau_evidencia.find((x: any) => x.grau === g)?.n ?? 0 }))} />
            </div>
            <div className="grafico">
                <h3>Distribuição por região</h3>
                <p className="muito-discreto">Contagens absolutas; leia sempre junto com a cobertura de cada região.</p>
                <TabelaSimples cabecalhos={["Região", "Universidades", "Pesquisa concluída", "Cobertura", "Iniciativas validadas"]}
                  linhas={d.por_regiao.map((r: any) => [r.chave, fmtNum(r.universidades), fmtNum(r.concluidas), fmtPct(r.universidades ? (r.concluidas / r.universidades) * 100 : null), fmtNum(r.iniciativas_validadas)])} />
            </div>

            <section className="grafico" aria-labelledby="t-evolucao">
              <h3 id="t-evolucao">Evolução das verificações</h3>
              {d.evolucao_verificacoes.length < 2 ? (
                <p className="discreto">Ainda não há histórico suficiente para uma série temporal ({d.evolucao_verificacoes.length} mês com coletas registradas).</p>
              ) : null}
              {d.evolucao_verificacoes.length > 0 && (
                <TabelaSimples cabecalhos={["Mês", "Execuções de coleta", "Universidades verificadas"]}
                  linhas={d.evolucao_verificacoes.map((e: any) => [e.mes, fmtNum(e.execucoes), fmtNum(e.universidades)])} />
              )}
            </section>
          </div>
        )}
      </Estado>
    </div>
  );
}
