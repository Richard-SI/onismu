import { pool } from "../db.js";
import { ErroHttp } from "../lib/erros.js";
import { Filtros } from "../lib/paginacao.js";

export interface FiltrosUniverso {
  regiao: string[];
  estado: string[];
  categoria_administrativa: string[];
  demo?: boolean;
}

/** Filtro sobre a tabela de universidades (alias u). Dados demonstrativos só entram se pedidos. */
export function filtrosUniverso(f: FiltrosUniverso, w = new Filtros()): Filtros {
  if (!f.demo) w.addLiteral("u.origem_dados = 'real'");
  if (f.regiao.length) w.add((p) => `u.regiao = ANY(${p})`, f.regiao);
  if (f.estado.length) w.add((p) => `u.estado = ANY(${p})`, f.estado);
  if (f.categoria_administrativa.length) w.add((p) => `u.categoria_administrativa = ANY(${p})`, f.categoria_administrativa);
  return w;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const indicador = (numerador: number, denominador: number, formula: string, rotulo_denominador: string) => ({
  valor: pct(numerador, denominador),
  numerador,
  denominador,
  formula,
  rotulo_denominador,
});

const VALIDADA = (demo?: boolean) => `i.status_validacao = 'validada' ${demo ? "" : "AND i.origem_dados = 'real'"}`;
const CONCLUIDA = "u.situacao_pesquisa IN ('concluida_com_iniciativas', 'concluida_sem_iniciativas')";
const POLITICA_FORMALIZADA = "c.codigo = 'politica_institucional' AND i.grau_evidencia = 1";

export async function calcularIndicadores(f: FiltrosUniverso) {
  const w = filtrosUniverso(f);
  const v = VALIDADA(f.demo);
  const base = (await pool.query(
    `WITH uu AS (SELECT u.* FROM universidades u ${w.where}),
          ii AS (SELECT i.*, c.codigo AS cat FROM iniciativas i JOIN categorias c ON c.id = i.categoria_principal_id
                  JOIN uu u ON u.id = i.universidade_id WHERE ${v})
     SELECT
       (SELECT count(*) FROM uu) AS universo,
       (SELECT count(*) FROM uu u WHERE ${CONCLUIDA}) AS concluidas,
       (SELECT count(*) FROM uu u WHERE ${CONCLUIDA} AND EXISTS (SELECT 1 FROM ii WHERE ii.universidade_id = u.id)) AS concluidas_com_validadas,
       (SELECT count(DISTINCT universidade_id) FROM ii) AS universidades_com_validadas,
       (SELECT count(*) FROM uu u WHERE ${CONCLUIDA} AND EXISTS (
            SELECT 1 FROM ii WHERE ii.universidade_id = u.id AND ii.cat = 'politica_institucional' AND ii.grau_evidencia = 1)) AS concluidas_com_politica_formalizada,
       (SELECT count(*) FROM ii) AS iniciativas_validadas,
       (SELECT count(*) FROM ii WHERE ii.cat = 'politica_institucional' AND ii.grau_evidencia = 1) AS politicas_formalizadas,
       (SELECT count(*) FROM iniciativas i JOIN uu u ON u.id = i.universidade_id WHERE i.status_validacao = 'pendente') AS iniciativas_pendentes,
       (SELECT count(*) FROM candidatos ca JOIN uu u ON u.id = ca.universidade_id WHERE ca.status = 'pendente') AS candidatos_pendentes,
       (SELECT max(x) FROM (SELECT max(validado_em) AS x FROM ii UNION ALL SELECT max(data_ultima_verificacao) FROM uu) t) AS data_atualizacao`,
    w.params,
  )).rows[0];

  const [situacoes, categorias, regioes, graus, evolucao] = await Promise.all([
    pool.query(`SELECT u.situacao_pesquisa AS chave, count(*) AS n FROM universidades u ${w.where} GROUP BY 1`, w.params),
    pool.query(
      `SELECT c.codigo AS chave, c.nome, c.ordem, count(i.id) AS n
         FROM categorias c
         LEFT JOIN (iniciativas i JOIN universidades u ON u.id = i.universidade_id ${w.where ? "AND " + w.clausulas.join(" AND ") : ""})
                ON i.categoria_principal_id = c.id AND ${v}
        WHERE c.ativa GROUP BY c.codigo, c.nome, c.ordem ORDER BY c.ordem`, w.params),
    pool.query(
      `SELECT u.regiao AS chave, count(DISTINCT u.id) AS universidades,
              count(DISTINCT u.id) FILTER (WHERE ${CONCLUIDA}) AS concluidas,
              count(i.id) AS iniciativas_validadas
         FROM universidades u LEFT JOIN iniciativas i ON i.universidade_id = u.id AND ${v}
         ${w.where} GROUP BY u.regiao ORDER BY u.regiao`, w.params),
    pool.query(
      `SELECT i.grau_evidencia AS chave, count(*) AS n FROM iniciativas i JOIN universidades u ON u.id = i.universidade_id
        ${w.where ? w.where + " AND " : "WHERE "} ${v} GROUP BY 1 ORDER BY 1`, w.params),
    pool.query(
      `SELECT to_char(date_trunc('month', e.finalizada_em), 'YYYY-MM') AS mes,
              count(*) AS execucoes, count(DISTINCT e.universidade_id) AS universidades
         FROM coleta_execucoes e JOIN universidades u ON u.id = e.universidade_id
        ${w.where ? w.where + " AND " : "WHERE "} e.status IN ('concluida', 'parcial') AND e.finalizada_em IS NOT NULL
        GROUP BY 1 ORDER BY 1`, w.params),
  ]);

  const porSituacao = Object.fromEntries(situacoes.rows.map((r) => [r.chave, r.n]));
  return {
    filtros: f,
    data_atualizacao: base.data_atualizacao,
    universo: base.universo,
    situacao_pesquisa: {
      nao_pesquisada: porSituacao.nao_pesquisada ?? 0,
      em_pesquisa: porSituacao.em_pesquisa ?? 0,
      aguardando_validacao: porSituacao.aguardando_validacao ?? 0,
      concluida_com_iniciativas: porSituacao.concluida_com_iniciativas ?? 0,
      concluida_sem_iniciativas: porSituacao.concluida_sem_iniciativas ?? 0,
      inconclusiva: porSituacao.inconclusiva ?? 0,
    },
    concluidas: base.concluidas,
    universidades_com_iniciativas_validadas: base.universidades_com_validadas,
    iniciativas_validadas: base.iniciativas_validadas,
    politicas_formalizadas: base.politicas_formalizadas,
    // Dados não validados são informados separadamente e nunca somados aos validados.
    em_validacao: { iniciativas_pendentes: base.iniciativas_pendentes, candidatos_pendentes: base.candidatos_pendentes },
    indicadores: {
      cobertura_pesquisa: indicador(base.concluidas, base.universo,
        "universidades com pesquisa concluída ÷ universidades no universo × 100", "universidades no universo institucional"),
      universidades_com_iniciativas: indicador(base.concluidas_com_validadas, base.concluidas,
        "universidades com pesquisa concluída e ≥ 1 iniciativa validada ÷ universidades com pesquisa concluída × 100",
        "universidades com pesquisa concluída"),
      cobertura_documental_politicas: indicador(base.concluidas_com_politica_formalizada, base.concluidas,
        "universidades com pesquisa concluída e política formalizada (Nível 1) identificada ÷ universidades com pesquisa concluída × 100",
        "universidades com pesquisa concluída"),
    },
    por_categoria: {
      denominador: base.iniciativas_validadas,
      rotulo_denominador: "iniciativas validadas (categoria principal)",
      itens: categorias.rows.map((r) => ({ categoria: r.chave, nome: r.nome, n: r.n, percentual: pct(r.n, base.iniciativas_validadas) })),
    },
    por_regiao: regioes.rows,
    por_grau_evidencia: graus.rows.map((r) => ({ grau: r.chave, n: r.n })),
    evolucao_verificacoes: evolucao.rows,
    cobertura_incompleta: base.concluidas < base.universo,
  };
}

export async function dadosMapa(f: FiltrosUniverso) {
  const w = filtrosUniverso(f);
  const v = VALIDADA(f.demo);
  const r = await pool.query(
    `SELECT u.estado, u.regiao,
            count(DISTINCT u.id) AS universidades,
            count(DISTINCT u.id) FILTER (WHERE ${CONCLUIDA}) AS concluidas,
            count(DISTINCT u.id) FILTER (WHERE u.situacao_pesquisa = 'nao_pesquisada') AS nao_pesquisadas,
            count(DISTINCT u.id) FILTER (WHERE u.situacao_pesquisa = 'inconclusiva') AS inconclusivas,
            count(DISTINCT u.id) FILTER (WHERE u.situacao_pesquisa IN ('em_pesquisa', 'aguardando_validacao')) AS em_andamento,
            count(DISTINCT i.universidade_id) AS universidades_com_iniciativas,
            count(i.id) AS iniciativas_validadas,
            count(i.id) FILTER (WHERE c.codigo = 'politica_institucional') AS politica_institucional,
            count(i.id) FILTER (WHERE c.codigo = 'projeto_extensao') AS projeto_extensao,
            count(i.id) FILTER (WHERE c.codigo = 'servico_permanente') AS servico_permanente,
            count(i.id) FILTER (WHERE c.codigo = 'acao_pontual') AS acao_pontual,
            count(i.id) FILTER (WHERE c.codigo = 'pesquisa_formacao') AS pesquisa_formacao
       FROM universidades u
       LEFT JOIN iniciativas i ON i.universidade_id = u.id AND ${v}
       LEFT JOIN categorias c ON c.id = i.categoria_principal_id
       ${w.where}
      GROUP BY u.estado, u.regiao ORDER BY u.estado`,
    w.params,
  );
  return r.rows;
}

export async function compararUniversidades(ids: number[], demo = false) {
  if (ids.length < 2 || ids.length > 8) throw new ErroHttp(400, "Selecione de 2 a 8 universidades.");
  const v = VALIDADA(demo);
  const r = await pool.query(
    `SELECT u.id, u.nome_oficial, u.sigla, u.categoria_administrativa, u.regiao, u.estado, u.municipio,
            u.situacao_pesquisa, u.data_ultima_verificacao,
            (SELECT count(*) FROM iniciativas i WHERE i.universidade_id = u.id AND ${v}) AS iniciativas_validadas,
            (SELECT coalesce(json_object_agg(x.codigo, x.n), '{}') FROM (
                SELECT c.codigo, count(i.id) AS n FROM categorias c
                  LEFT JOIN iniciativas i ON i.categoria_principal_id = c.id AND i.universidade_id = u.id AND ${v}
                 GROUP BY c.codigo) x) AS por_categoria,
            (SELECT count(*) FROM iniciativas i JOIN categorias c ON c.id = i.categoria_principal_id
              WHERE i.universidade_id = u.id AND ${v} AND ${POLITICA_FORMALIZADA}) AS politicas_formalizadas,
            (SELECT coalesce(array_agg(DISTINCT pa.codigo), '{}') FROM iniciativas i
               JOIN iniciativa_publicos ip ON ip.iniciativa_id = i.id JOIN publicos_alvo pa ON pa.id = ip.publico_alvo_id
              WHERE i.universidade_id = u.id AND ${v}) AS publicos,
            (SELECT coalesce(json_object_agg(x.abr, x.n), '{}') FROM (
                SELECT coalesce(i.abrangencia, 'nao_informada') AS abr, count(*) AS n FROM iniciativas i
                 WHERE i.universidade_id = u.id AND ${v} GROUP BY 1) x) AS abrangencia,
            (SELECT count(DISTINCT d.id) FROM documentos d JOIN iniciativa_documentos idoc ON idoc.documento_id = d.id
               JOIN iniciativas i ON i.id = idoc.iniciativa_id WHERE d.universidade_id = u.id AND ${v}) AS documentos,
            (SELECT count(DISTINCT e.fonte_id) FROM evidencias e JOIN iniciativas i ON i.id = e.iniciativa_id
              WHERE i.universidade_id = u.id AND ${v}) AS fontes,
            (SELECT count(*) FROM coleta_execucoes e WHERE e.universidade_id = u.id AND e.status IN ('concluida', 'parcial')) AS execucoes_coleta,
            (SELECT max(e.finalizada_em) FROM coleta_execucoes e WHERE e.universidade_id = u.id) AS ultima_coleta
       FROM universidades u WHERE u.id = ANY($1) ${demo ? "" : "AND u.origem_dados = 'real'"}
      ORDER BY array_position($1::int[], u.id)`,
    [ids],
  );
  if (r.rowCount !== new Set(ids).size) throw new ErroHttp(404, "Uma ou mais universidades não foram encontradas.");
  return r.rows;
}

export async function comparacaoTematica(f: FiltrosUniverso) {
  const w = filtrosUniverso(f);
  const v = VALIDADA(f.demo);
  const and = w.where ? "AND " + w.clausulas.join(" AND ") : "";
  const tem = (cond: string) =>
    `EXISTS (SELECT 1 FROM iniciativas i JOIN categorias c ON c.id = i.categoria_principal_id WHERE i.universidade_id = u.id AND ${v} AND ${cond})`;
  const resumo = (await pool.query(
    `SELECT count(*) AS concluidas,
            count(*) FILTER (WHERE ${tem(POLITICA_FORMALIZADA)}) AS com_politica_formalizada,
            count(*) FILTER (WHERE ${tem("c.codigo = 'projeto_extensao'")}) AS com_projeto_extensao,
            count(*) FILTER (WHERE ${tem(POLITICA_FORMALIZADA)} AND ${tem("c.codigo = 'projeto_extensao'")}) AS com_ambos,
            count(*) FILTER (WHERE ${tem("c.codigo = 'politica_institucional'")}) AS com_politica_qualquer_nivel
       FROM universidades u WHERE ${CONCLUIDA} ${and}`,
    w.params,
  )).rows[0];
  const [regiaoCategoria, publicos, evidenciasCategoria] = await Promise.all([
    pool.query(
      `SELECT u.regiao, c.codigo AS categoria, count(i.id) AS n
         FROM iniciativas i JOIN universidades u ON u.id = i.universidade_id JOIN categorias c ON c.id = i.categoria_principal_id
        WHERE ${v} ${and} GROUP BY 1, 2 ORDER BY 1, 2`, w.params),
    pool.query(
      `SELECT pa.codigo AS publico, pa.nome, count(DISTINCT i.id) AS iniciativas, count(DISTINCT i.universidade_id) AS universidades
         FROM iniciativas i JOIN universidades u ON u.id = i.universidade_id
         JOIN iniciativa_publicos ip ON ip.iniciativa_id = i.id JOIN publicos_alvo pa ON pa.id = ip.publico_alvo_id
        WHERE ${v} ${and} GROUP BY pa.codigo, pa.nome, pa.ordem ORDER BY pa.ordem`, w.params),
    pool.query(
      `SELECT c.codigo AS categoria, count(DISTINCT i.id) AS iniciativas,
              count(e.id) AS evidencias,
              count(DISTINCT i.id) FILTER (WHERE EXISTS (SELECT 1 FROM iniciativa_documentos idoc WHERE idoc.iniciativa_id = i.id)) AS com_documento,
              count(DISTINCT i.id) FILTER (WHERE i.grau_evidencia <= 2) AS nivel_1_ou_2
         FROM iniciativas i JOIN universidades u ON u.id = i.universidade_id JOIN categorias c ON c.id = i.categoria_principal_id
         LEFT JOIN evidencias e ON e.iniciativa_id = i.id
        WHERE ${v} ${and} GROUP BY c.codigo, c.ordem ORDER BY c.ordem`, w.params),
  ]);
  const d = resumo.concluidas;
  return {
    filtros: f,
    denominador: d,
    rotulo_denominador: "universidades com pesquisa concluída",
    com_politica_formalizada: { n: resumo.com_politica_formalizada, percentual: pct(resumo.com_politica_formalizada, d) },
    com_politica_qualquer_nivel: { n: resumo.com_politica_qualquer_nivel, percentual: pct(resumo.com_politica_qualquer_nivel, d) },
    com_projeto_extensao: { n: resumo.com_projeto_extensao, percentual: pct(resumo.com_projeto_extensao, d) },
    com_ambos: { n: resumo.com_ambos, percentual: pct(resumo.com_ambos, d) },
    regiao_categoria: regiaoCategoria.rows,
    publicos: publicos.rows,
    evidencias_por_categoria: evidenciasCategoria.rows,
  };
}
