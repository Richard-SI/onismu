import { Link } from "react-router-dom";
import { qs, useApi } from "../api";
import { AvisoCobertura, Estado, Indicador, IndicadorPct, useTitulo } from "../componentes/base";
import { useDemo } from "../contexto";
import { fmtData, fmtNum } from "../rotulos";

export function Inicio() {
  useTitulo("Início");
  const demo = useDemo();
  const { dados: d, erro } = useApi<any>(`/api/publico/indicadores${qs({ demo })}`);
  return (
    <div className="pilha">
      <section className="heroi">
        <h1>Iniciativas de cuidado à saúde mental nas universidades brasileiras, com fontes verificáveis</h1>
        <p className="lead">
          O ONISMU reúne, classifica e compara políticas institucionais, serviços permanentes, projetos de extensão, ações pontuais e
          iniciativas de pesquisa e formação em saúde mental — informações hoje dispersas em sites, pró-reitorias, resoluções e relatórios.
          Cada registro publicado traz a fonte original e o trecho que o comprova.
        </p>
        <div className="linha">
          <Link className="botao" to="/iniciativas">Consultar o catálogo</Link>
          <Link className="botao botao-sec" to="/mapa">Ver o mapa</Link>
          <Link className="botao botao-sec" to="/comparar">Comparar universidades</Link>
        </div>
      </section>

      <Estado erro={erro}>
        {d && (
          <>
            <div className="grade grade-4">
              <Indicador rotulo="Universidades no universo" valor={fmtNum(d.universo)} base="Cadastro oficial (INEP/e-MEC)" />
              <IndicadorPct rotulo="Cobertura da pesquisa" ind={d.indicadores.cobertura_pesquisa} />
              <Indicador rotulo="Iniciativas validadas" valor={fmtNum(d.iniciativas_validadas)} base={`${fmtNum(d.em_validacao.candidatos_pendentes)} registros sugeridos aguardam revisão (não contados)`} />
              <Indicador rotulo="Políticas formalizadas (Nível 1)" valor={fmtNum(d.politicas_formalizadas)} base="com documento normativo vinculado" />
            </div>
            <p className="muito-discreto">Dados atualizados em {fmtData(d.data_atualizacao)}. Todos os indicadores são calculados diretamente da base.</p>
            <AvisoCobertura concluidas={d.concluidas} universo={d.universo} />
          </>
        )}
      </Estado>

      <section className="grade grade-3">
        <div className="cartao">
          <h3>O que é mapeado</h3>
          <p className="discreto">Iniciativas institucionais públicas — nunca dados de pessoas atendidas. A taxonomia separa cinco categorias e permite relacionar
            projetos e serviços às políticas que os sustentam, sem dupla contagem.</p>
        </div>
        <div className="cartao">
          <h3>Como é verificado</h3>
          <p className="discreto">A coleta assistida (busca, leitura de páginas e, quando habilitada, IA) apenas <em>sugere</em> registros.
            Nada é publicado sem revisão humana com fonte e trecho comprobatório. Uma escala de quatro níveis indica o grau de evidência documental.</p>
        </div>
        <div className="cartao">
          <h3>Como ler os resultados</h3>
          <p className="discreto">Diferenciamos “não pesquisada”, “pesquisa inconclusiva” e “nenhuma iniciativa localizada”. A ausência de registro
            não significa ausência de iniciativa, e o observatório não produz rankings de qualidade. <Link to="/metodologia">Metodologia completa</Link>.</p>
        </div>
      </section>
    </div>
  );
}
