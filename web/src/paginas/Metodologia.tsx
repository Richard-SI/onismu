import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useApi } from "../api";
import { useTitulo } from "../componentes/base";
import { TabelaSimples } from "../componentes/graficos";
import { ReportarErro } from "../componentes/ReportarErro";
import { GRAUS, SITUACOES_PESQUISA, fmtData, fmtNum } from "../rotulos";

export function Metodologia() {
  useTitulo("Metodologia e transparência");
  const { dados: tax } = useApi<any>("/api/publico/taxonomia");
  const { dados: atu } = useApi<any>("/api/publico/atualizacoes");
  const { dados: ind } = useApi<any>("/api/publico/indicadores");
  const { hash } = useLocation();
  useEffect(() => { if (hash) document.querySelector(hash)?.scrollIntoView(); }, [hash, tax]);

  return (
    <article className="pilha" style={{ maxWidth: 900 }}>
      <h1>Metodologia e transparência</h1>
      <nav className="cartao" aria-label="Sumário">
        <strong>Nesta página:</strong>{" "}
        {[["objetivos", "Objetivos"], ["universo", "Universo"], ["criterios", "Inclusão e exclusão"], ["busca", "Estratégia de busca"], ["taxonomia", "Taxonomia"],
          ["evidencia", "Evidência"], ["situacoes", "Situações de pesquisa"], ["indicadores", "Indicadores"], ["corte", "Data de corte"], ["limitacoes", "Limitações"],
          ["historico", "Atualizações"], ["reportar", "Reportar erro"]].map(([id, t], k) => <span key={id}>{k ? " · " : ""}<a href={`#${id}`}>{t}</a></span>)}
      </nav>

      <section id="objetivos"><h2>Objetivos</h2>
        <p>Mapear, organizar, classificar, verificar e comparar iniciativas de cuidado à saúde mental desenvolvidas por universidades brasileiras,
          reunindo em uma base pública informações hoje dispersas em sites institucionais, pró-reitorias, serviços de assistência estudantil, projetos
          de extensão, documentos normativos, relatórios e notícias oficiais. O observatório é uma ferramenta de investigação e transparência
          institucional; <strong>não é um ranking</strong> de qualidade ou efetividade dos serviços.</p>
        <p>O projeto dialoga com a pesquisa “Qual o preço a se pagar pela dor? Uma análise das políticas de saúde mental nas universidades federais do
          Rio Grande do Sul”, cujo campo empírico (UFRGS, UFPel, FURG, UFCSPA, Unipampa, UFSM e UFFS) compôs a pesquisa-piloto.</p>
      </section>

      <section id="universo"><h2>Universo institucional</h2>
        <p>O universo é formado pelas instituições cuja organização acadêmica é <em>Universidade</em> nos Microdados do Censo da Educação Superior
          (INEP, ano de referência 2024), abrangendo universidades públicas federais, estaduais e municipais, privadas (com e sem fins lucrativos,
          incluindo comunitárias e confessionais) e instituições de categoria especial. Cada registro guarda o código institucional e-MEC/INEP e a fonte utilizada.
          {ind && <> Atualmente: <strong>{fmtNum(ind.universo)} universidades</strong>.</>}</p>
      </section>

      <section id="criterios"><h2>Critérios de inclusão e exclusão</h2>
        <ul>
          <li><strong>Incluídas:</strong> iniciativas institucionais públicas e documentadas de cuidado, prevenção, promoção, atenção psicossocial, formação ou pesquisa em saúde mental, vinculadas a uma universidade do universo.</li>
          <li><strong>Excluídas:</strong> faculdades, centros universitários, institutos federais e CEFETs (mantidos fora do escopo principal, para ampliação futura); iniciativas sem fonte verificável; dados pessoais de pessoas atendidas.</li>
          <li>Uma iniciativa só é publicada após revisão humana, com ao menos uma fonte e um trecho comprobatório. O Nível 1 exige documento normativo vinculado.</li>
        </ul>
      </section>

      <section id="busca"><h2>Estratégia de busca e coleta</h2>
        <p>Para cada universidade, combinam-se nome oficial, sigla e domínio institucional com termos controlados — “saúde mental”, “política de saúde mental”,
          “atenção psicossocial”, “projeto de extensão” saúde mental, “acolhimento psicológico”, “serviço de psicologia”, “assistência estudantil” saúde mental,
          “promoção da saúde mental”, “sofrimento psíquico” estudantes, “programa institucional” saúde mental, “prevenção do suicídio” e resolução “saúde mental” —
          com restrição ao domínio oficial e busca de PDFs, percorrendo mais de uma página de resultados.</p>
        <p>São priorizados sites oficiais, documentos normativos, pró-reitorias, sistemas de extensão, assistência estudantil, relatórios e repositórios.
          Fontes secundárias servem apenas para descoberta. As páginas são acessadas por um coletor identificado que respeita o <code>robots.txt</code>,
          limites de tamanho, tempo e frequência. A IA, quando habilitada, apenas sugere candidatos; regras determinísticas descartam trechos que não existem
          literalmente na fonte e anulam datas, números de documentos e unidades que não aparecem no texto. Todo conteúdo externo é tratado como dado não confiável.</p>
      </section>

      <section id="taxonomia"><h2>Taxonomia</h2>
        <p>Cada iniciativa tem uma categoria principal e pode ter categorias secundárias. Relações (por exemplo, um projeto vinculado a uma política) não duplicam contagens.</p>
        {tax && <TabelaSimples cabecalhos={["Categoria", "Inclui"]} linhas={tax.categorias.map((c: any) => [<strong key={c.codigo}>{c.nome}</strong>, <span key="i" style={{ textAlign: "left", display: "block" }}>{c.inclui}</span>])} />}
      </section>

      <section id="evidencia"><h2>Critérios de evidência</h2>
        <TabelaSimples cabecalhos={["Nível", "Critério"]} linhas={[
          [GRAUS[1], "Documento oficial (resolução, portaria, política, regimento ou plano) que formaliza explicitamente a política."],
          [GRAUS[2], "Programa institucional documentado, sem formalização normativa localizada."],
          [GRAUS[3], "Serviço ou atividade documentada, sem evidência suficiente de política abrangente."],
          [GRAUS[4], "Documentação insuficiente para confirmar a natureza ou a situação da iniciativa."],
        ]} />
        <p style={{ marginTop: 12 }}>A escala mede o <strong>grau de evidência disponível</strong>, não a qualidade do cuidado. São registrados separadamente: grau de evidência,
          situação da validação, situação documentada da iniciativa (ativa, encerrada, desconhecida) e atualidade da fonte (fonte com mais de 24 meses é sinalizada).
          Não se conclui que uma política inexiste porque uma resolução não foi localizada.</p>
      </section>

      <section id="situacoes"><h2>Situações de pesquisa</h2>
        <ul>{Object.entries(SITUACOES_PESQUISA).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
        <p>“Concluída sem iniciativas localizadas” significa apenas que nada foi identificado nas fontes consultadas durante o procedimento documentado.
          Uma universidade só pode ser declarada pesquisada se houver fontes efetivamente consultadas registradas no sistema.</p>
      </section>

      <section id="indicadores"><h2>Definições dos indicadores</h2>
        <TabelaSimples cabecalhos={["Indicador", "Fórmula"]} linhas={[
          ["Cobertura da pesquisa", "universidades com pesquisa concluída ÷ universidades no universo × 100"],
          ["Universidades com iniciativas identificadas", "universidades com pesquisa concluída e ≥ 1 iniciativa validada ÷ universidades com pesquisa concluída × 100"],
          ["Cobertura documental de políticas", "universidades com pesquisa concluída e política formalizada (Nível 1) ÷ universidades com pesquisa concluída × 100"],
          ["Distribuição por categoria", "iniciativas validadas em cada categoria principal ÷ total de iniciativas validadas"],
        ]} />
        <p style={{ marginTop: 12 }}>Registros em validação nunca são somados aos validados; quando exibidos, aparecem separados. Dados demonstrativos (fictícios) são excluídos de todos os indicadores, salvo escolha explícita.</p>
      </section>

      <section id="corte"><h2>Data de corte</h2>
        <p>{ind ? <>Os dados publicados refletem a base em <strong>{fmtData(ind.data_atualizacao)}</strong> (data mais recente de validação ou verificação).</> : "—"}</p>
      </section>

      <section id="limitacoes"><h2>Limitações</h2>
        <ul>
          <li>A cobertura nacional está em construção; resultados descrevem apenas as instituições pesquisadas.</li>
          <li>Iniciativas não divulgadas publicamente, ou publicadas em sistemas fechados, podem não ser localizadas.</li>
          <li>Sites institucionais mudam: uma fonte pode sair do ar ou ser alterada após a consulta (a data de consulta é sempre registrada).</li>
          <li>O universo baseia-se no Censo de 2024; instituições criadas ou reclassificadas depois não constam até a próxima atualização.</li>
          <li>Universidades multicampi aparecem sob o município da sede.</li>
        </ul>
      </section>

      <section id="historico"><h2>Histórico de atualizações</h2>
        {atu && (atu.coletas.length || atu.validacoes.length) ? (
          <div className="grade grade-2">
            <TabelaSimples legenda="Coletas realizadas" cabecalhos={["Data", "Execuções", "Instituições"]}
              linhas={atu.coletas.map((c: any) => [fmtData(c.data), fmtNum(c.execucoes), c.instituicoes.join(", ")])} />
            <TabelaSimples legenda="Validações publicadas" cabecalhos={["Data", "Iniciativas validadas"]}
              linhas={atu.validacoes.map((v: any) => [fmtData(v.data), fmtNum(v.iniciativas_validadas)])} />
          </div>
        ) : <p className="discreto">Sem atualizações registradas.</p>}
      </section>

      <section id="reportar"><h2>Reportar erros</h2>
        <p>Encontrou um erro, uma omissão ou uma fonte desatualizada? Envie um relato. Cada página de universidade e de iniciativa também tem um botão de relato.</p>
        <ReportarErro tipo="geral" />
      </section>
    </article>
  );
}
