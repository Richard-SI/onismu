import { Link } from "react-router-dom";
import { qs, useApi } from "../api";
import { AvisoCobertura, Estado, Indicador, useTitulo } from "../componentes/base";
import { FiltrosUniverso, useFiltrosUniverso } from "../componentes/FiltrosUniverso";
import { BarrasEmpilhadas, BarrasHorizontais, TabelaSimples } from "../componentes/graficos";
import { useDemo } from "../contexto";
import { CATEGORIAS, COR_CATEGORIA, ORDEM_CATEGORIAS, REGIOES, fmtNum, fmtPct, rotulo } from "../rotulos";

export function ComparacaoTematica() {
  useTitulo("Comparação temática");
  const filtros = useFiltrosUniverso();
  const demo = useDemo();
  const params = qs({ ...filtros.valores, demo });
  const { dados: d, erro, carregando } = useApi<any>(`/api/publico/comparacao-tematica${params}`);
  const { dados: ind } = useApi<any>(`/api/publico/indicadores${params}`);
  const base = `de ${fmtNum(d?.denominador)} ${d?.rotulo_denominador ?? ""}`;
  const regioes = REGIOES.filter((r) => !filtros.valores.regiao.length || filtros.valores.regiao.includes(r));

  return (
    <div className="pilha">
      <h1>Comparação temática: políticas institucionais e projetos de extensão</h1>
      <p className="discreto">Os percentuais têm como denominador as universidades com pesquisa concluída no recorte selecionado.
        Universidades não pesquisadas, em validação ou com pesquisa inconclusiva não entram no denominador.</p>
      <FiltrosUniverso {...filtros} />
      {ind && <AvisoCobertura concluidas={ind.concluidas} universo={ind.universo} />}
      <Estado erro={erro} carregando={carregando && !d}>
        {d && (
          <div className={`pilha ${carregando ? "carregando" : ""}`}>
            <div className="grade grade-4">
              <Indicador rotulo="Com política formalizada identificada" valor={fmtPct(d.com_politica_formalizada.percentual)} base={`${fmtNum(d.com_politica_formalizada.n)} ${base}`} />
              <Indicador rotulo="Com projetos de extensão" valor={fmtPct(d.com_projeto_extensao.percentual)} base={`${fmtNum(d.com_projeto_extensao.n)} ${base}`} />
              <Indicador rotulo="Com ambas as categorias" valor={fmtPct(d.com_ambos.percentual)} base={`${fmtNum(d.com_ambos.n)} ${base} (política Nível 1 + extensão)`} />
              <Indicador rotulo="Com política em qualquer nível de evidência" valor={fmtPct(d.com_politica_qualquer_nivel.percentual)} base={`${fmtNum(d.com_politica_qualquer_nivel.n)} ${base}`} />
            </div>
            {d.denominador === 0 && <div className="vazio">Ainda não há universidades com pesquisa concluída neste recorte — os percentuais não podem ser calculados.</div>}

            <BarrasEmpilhadas titulo="Registros validados por região e categoria"
              subtitulo="Contagens absolutas — compare com a cobertura de cada região antes de interpretar"
              series={ORDEM_CATEGORIAS.map((c) => ({ chave: c, nome: CATEGORIAS[c], cor: COR_CATEGORIA[c] }))}
              linhas={regioes.map((r) => ({ rotulo: r, ...Object.fromEntries(ORDEM_CATEGORIAS.map((c) => [c, Number(d.regiao_categoria.find((x: any) => x.regiao === r && x.categoria === c)?.n ?? 0)])) }))} />

            <div className="grade grade-2">
              <BarrasHorizontais titulo="Iniciativas por público-alvo" rotuloValor="Iniciativas"
                subtitulo="Uma iniciativa pode atender a mais de um público"
                dados={d.publicos.map((p: any) => ({ rotulo: p.nome, valor: p.iniciativas }))} />
              <div className="grafico">
                <h3>Evidências documentais por categoria</h3>
                <TabelaSimples cabecalhos={["Categoria", "Iniciativas", "Evidências", "Com documento", "Nível 1 ou 2"]}
                  linhas={d.evidencias_por_categoria.map((e: any) => [rotulo(CATEGORIAS, e.categoria), fmtNum(e.iniciativas), fmtNum(e.evidencias), fmtNum(e.com_documento), fmtNum(e.nivel_1_ou_2)])} />
                <p className="muito-discreto" style={{ marginTop: 8 }}>“Nível 1 ou 2”: política formalizada ou programa institucional estruturado (grau de documentação, não de qualidade).</p>
              </div>
            </div>
            <p><Link to="/iniciativas">Explorar iniciativas por público específico no catálogo</Link></p>
          </div>
        )}
      </Estado>
    </div>
  );
}
