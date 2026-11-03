import { pool } from "../db.js";
import { GRAUS_EVIDENCIA, TIPOS_DOCUMENTO_NORMATIVO } from "../dominio.js";
import { ErroHttp } from "../lib/erros.js";
import { Filtros } from "../lib/paginacao.js";
import { gerarCsv, gerarXlsx, type Coluna } from "../lib/planilhas.js";
import { calcularIndicadores, filtrosUniverso, type FiltrosUniverso } from "./indicadores.js";
import { listarIniciativas, type FiltrosIniciativas } from "./iniciativas.js";

export const TIPOS_EXPORTACAO = ["universidades", "iniciativas", "politicas", "extensao", "documentos", "fontes", "indicadores"] as const;
export type TipoExportacao = (typeof TIPOS_EXPORTACAO)[number];

const URL_PUBLICA = process.env.URL_PUBLICA ?? "";

const COLS_INICIATIVA: Coluna<any>[] = [
  { chave: "id", titulo: "id_iniciativa", valor: (r) => r.id },
  { chave: "nome", titulo: "nome", valor: (r) => r.nome },
  { chave: "universidade_id", titulo: "id_universidade", valor: (r) => r.universidade_id },
  { chave: "universidade_sigla", titulo: "sigla_universidade", valor: (r) => r.universidade_sigla },
  { chave: "universidade_nome", titulo: "universidade", valor: (r) => r.universidade_nome },
  { chave: "estado", titulo: "uf", valor: (r) => r.estado },
  { chave: "regiao", titulo: "regiao", valor: (r) => r.regiao },
  { chave: "categoria_administrativa", titulo: "categoria_administrativa", valor: (r) => r.categoria_administrativa },
  { chave: "categoria_principal", titulo: "categoria_principal", valor: (r) => r.categoria_principal },
  { chave: "categorias_secundarias", titulo: "categorias_secundarias", valor: (r) => r.categorias_secundarias },
  { chave: "publicos", titulo: "publicos_alvo", valor: (r) => r.publicos },
  { chave: "unidade_responsavel", titulo: "unidade_responsavel", valor: (r) => r.unidade_responsavel },
  { chave: "modalidade", titulo: "modalidade", valor: (r) => r.modalidade },
  { chave: "abrangencia", titulo: "abrangencia", valor: (r) => r.abrangencia },
  { chave: "situacao_documentada", titulo: "situacao_documentada", valor: (r) => r.situacao_documentada },
  { chave: "grau_evidencia", titulo: "grau_evidencia", valor: (r) => `${r.grau_evidencia} - ${GRAUS_EVIDENCIA[r.grau_evidencia as 1]}` },
  { chave: "tem_documento_normativo", titulo: "tem_documento_normativo", valor: (r) => (r.tem_documento_normativo ? "sim" : "nao") },
  { chave: "status_validacao", titulo: "status_validacao", valor: (r) => r.status_validacao },
  { chave: "atualidade_fonte", titulo: "atualidade_fonte", valor: (r) => r.atualidade_fonte },
  { chave: "data_ultima_evidencia", titulo: "data_ultima_evidencia", valor: (r) => r.data_ultima_evidencia },
  { chave: "data_ultima_verificacao", titulo: "data_ultima_verificacao", valor: (r) => r.data_ultima_verificacao },
  { chave: "fontes", titulo: "urls_fontes", valor: (r) => r.urls_fontes },
  { chave: "origem_dados", titulo: "origem_dados", valor: (r) => r.origem_dados },
  { chave: "descricao", titulo: "descricao", valor: (r) => r.descricao },
];

const COLS_UNIVERSIDADE: Coluna<any>[] = [
  { chave: "id", titulo: "id_universidade", valor: (r) => r.id },
  { chave: "codigo_institucional", titulo: "codigo_emec", valor: (r) => r.codigo_institucional },
  { chave: "nome_oficial", titulo: "nome_oficial", valor: (r) => r.nome_oficial },
  { chave: "sigla", titulo: "sigla", valor: (r) => r.sigla },
  { chave: "categoria_administrativa", titulo: "categoria_administrativa", valor: (r) => r.categoria_administrativa },
  { chave: "subcategoria", titulo: "subcategoria", valor: (r) => r.subcategoria },
  { chave: "regiao", titulo: "regiao", valor: (r) => r.regiao },
  { chave: "estado", titulo: "uf", valor: (r) => r.estado },
  { chave: "municipio", titulo: "municipio", valor: (r) => r.municipio },
  { chave: "site_oficial", titulo: "site_oficial", valor: (r) => r.site_oficial },
  { chave: "situacao_pesquisa", titulo: "situacao_pesquisa", valor: (r) => r.situacao_pesquisa },
  { chave: "iniciativas_validadas", titulo: "iniciativas_validadas", valor: (r) => r.iniciativas_validadas },
  { chave: "data_ultima_verificacao", titulo: "data_ultima_verificacao", valor: (r) => r.data_ultima_verificacao },
  { chave: "fonte_cadastro", titulo: "fonte_cadastro", valor: (r) => r.fonte_cadastro },
  { chave: "origem_dados", titulo: "origem_dados", valor: (r) => r.origem_dados },
];

const COLS_DOCUMENTO: Coluna<any>[] = [
  { chave: "id", titulo: "id_documento", valor: (r) => r.id },
  { chave: "universidade_id", titulo: "id_universidade", valor: (r) => r.universidade_id },
  { chave: "sigla", titulo: "sigla_universidade", valor: (r) => r.sigla },
  { chave: "titulo", titulo: "titulo", valor: (r) => r.titulo },
  { chave: "tipo_documento", titulo: "tipo_documento", valor: (r) => r.tipo_documento },
  { chave: "numero_documento", titulo: "numero_documento", valor: (r) => r.numero_documento },
  { chave: "data_publicacao", titulo: "data_publicacao", valor: (r) => r.data_publicacao },
  { chave: "orgao_emissor", titulo: "orgao_emissor", valor: (r) => r.orgao_emissor },
  { chave: "url_original", titulo: "url_original", valor: (r) => r.url_original },
  { chave: "iniciativas", titulo: "ids_iniciativas", valor: (r) => r.iniciativas },
];

const COLS_FONTE: Coluna<any>[] = [
  { chave: "id", titulo: "id_fonte", valor: (r) => r.id },
  { chave: "universidade_id", titulo: "id_universidade", valor: (r) => r.universidade_id },
  { chave: "sigla", titulo: "sigla_universidade", valor: (r) => r.sigla },
  { chave: "titulo", titulo: "titulo", valor: (r) => r.titulo },
  { chave: "tipo_fonte", titulo: "tipo_fonte", valor: (r) => r.tipo_fonte },
  { chave: "url_original", titulo: "url_original", valor: (r) => r.url_original },
  { chave: "data_publicacao", titulo: "data_publicacao", valor: (r) => r.data_publicacao },
  { chave: "data_consulta", titulo: "data_consulta", valor: (r) => r.data_consulta },
  { chave: "situacao_fonte", titulo: "situacao_fonte", valor: (r) => r.situacao_fonte },
  { chave: "iniciativas", titulo: "ids_iniciativas", valor: (r) => r.iniciativas },
];

const COLS_INDICADOR: Coluna<any>[] = [
  { chave: "indicador", titulo: "indicador", valor: (r) => r.indicador },
  { chave: "valor", titulo: "valor", valor: (r) => r.valor },
  { chave: "numerador", titulo: "numerador", valor: (r) => r.numerador },
  { chave: "denominador", titulo: "denominador", valor: (r) => r.denominador },
  { chave: "formula", titulo: "formula_ou_referencia", valor: (r) => r.formula },
];

async function iniciativasComFontes(f: FiltrosIniciativas) {
  const { itens } = await listarIniciativas(f, null, true);
  if (!itens.length) return itens;
  const fontes = await pool.query<{ iniciativa_id: number; urls: string[] }>(
    `SELECT e.iniciativa_id, array_agg(DISTINCT f.url_original) AS urls FROM evidencias e JOIN fontes f ON f.id = e.fonte_id
      WHERE e.iniciativa_id = ANY($1) GROUP BY e.iniciativa_id`, [itens.map((i: any) => i.id)],
  );
  const mapa = new Map(fontes.rows.map((r) => [r.iniciativa_id, r.urls]));
  return itens.map((i: any) => ({ ...i, urls_fontes: mapa.get(i.id) ?? [] }));
}

/** Universidades e entidades vinculadas a iniciativas validadas (respeitando filtros). */
async function dadosRelacionados(tipo: "universidades" | "documentos" | "fontes", fu: FiltrosUniverso, fi: FiltrosIniciativas) {
  const w = filtrosUniverso(fu, new Filtros());
  if (tipo === "universidades") {
    if (fi.q) w.add((p) => `f_normalizar(u.nome_oficial || ' ' || coalesce(u.sigla,'')) LIKE f_normalizar(${p})`, `%${fi.q}%`);
    return (await pool.query(
      `SELECT u.*, (SELECT count(*) FROM iniciativas i WHERE i.universidade_id = u.id AND i.status_validacao = 'validada') AS iniciativas_validadas
         FROM universidades u ${w.where} ORDER BY u.estado, f_normalizar(u.nome_oficial)`, w.params)).rows;
  }
  w.addLiteral("i.status_validacao = 'validada'");
  if (fi.universidade_id.length) w.add((p) => `i.universidade_id = ANY(${p})`, fi.universidade_id);
  if (tipo === "documentos") {
    return (await pool.query(
      `SELECT d.*, u.sigla, array_agg(DISTINCT i.id) AS iniciativas
         FROM documentos d JOIN iniciativa_documentos idoc ON idoc.documento_id = d.id
         JOIN iniciativas i ON i.id = idoc.iniciativa_id JOIN universidades u ON u.id = d.universidade_id
        ${w.where} GROUP BY d.id, u.sigla ORDER BY u.sigla, d.data_publicacao DESC NULLS LAST`, w.params)).rows;
  }
  return (await pool.query(
    `SELECT f.id, coalesce(f.universidade_id, i.universidade_id) AS universidade_id, u.sigla, f.titulo, f.tipo_fonte, f.url_original,
            f.data_publicacao, f.data_consulta, f.situacao_fonte, array_agg(DISTINCT i.id) AS iniciativas
       FROM fontes f JOIN evidencias e ON e.fonte_id = f.id JOIN iniciativas i ON i.id = e.iniciativa_id
       JOIN universidades u ON u.id = i.universidade_id
      ${w.where} GROUP BY f.id, i.universidade_id, u.sigla ORDER BY u.sigla, f.data_consulta DESC`, w.params)).rows;
}

async function linhasIndicadores(fu: FiltrosUniverso) {
  const ind = await calcularIndicadores(fu);
  const linhas: any[] = [
    { indicador: "data_atualizacao", valor: ind.data_atualizacao, formula: "maior data de validação/verificação" },
    { indicador: "universidades_no_universo", valor: ind.universo, formula: "universidades do cadastro institucional (filtros aplicados)" },
    ...Object.entries(ind.situacao_pesquisa).map(([k, v]) => ({ indicador: `situacao_${k}`, valor: v, denominador: ind.universo })),
    ...Object.entries(ind.indicadores).map(([k, v]) => ({ indicador: k, ...v })),
    { indicador: "iniciativas_validadas", valor: ind.iniciativas_validadas },
    { indicador: "politicas_formalizadas_nivel_1", valor: ind.politicas_formalizadas },
    ...ind.por_categoria.itens.map((c) => ({
      indicador: `categoria_${c.categoria}`, valor: c.n, numerador: c.n, denominador: ind.por_categoria.denominador,
      formula: `% = ${c.percentual ?? "-"} (base: ${ind.por_categoria.rotulo_denominador})`,
    })),
    { indicador: "em_validacao_candidatos_pendentes", valor: ind.em_validacao.candidatos_pendentes, formula: "não incluídos nos indicadores validados" },
  ];
  return linhas;
}

export async function gerarExportacao(tipo: TipoExportacao, formato: "csv" | "xlsx", fu: FiltrosUniverso, fi: FiltrosIniciativas) {
  let linhas: any[];
  let colunas: Coluna<any>[];
  switch (tipo) {
    case "iniciativas": linhas = await iniciativasComFontes(fi); colunas = COLS_INICIATIVA; break;
    case "politicas": linhas = await iniciativasComFontes({ ...fi, categoria: ["politica_institucional"] }); colunas = COLS_INICIATIVA; break;
    case "extensao": linhas = await iniciativasComFontes({ ...fi, categoria: ["projeto_extensao"] }); colunas = COLS_INICIATIVA; break;
    case "universidades": linhas = await dadosRelacionados("universidades", fu, fi); colunas = COLS_UNIVERSIDADE; break;
    case "documentos": linhas = await dadosRelacionados("documentos", fu, fi); colunas = COLS_DOCUMENTO; break;
    case "fontes": linhas = await dadosRelacionados("fontes", fu, fi); colunas = COLS_FONTE; break;
    case "indicadores": linhas = await linhasIndicadores(fu); colunas = COLS_INDICADOR; break;
    default: throw new ErroHttp(400, "Tipo de exportação inválido.");
  }
  const nome = `onismu_${tipo}_${new Date().toISOString().slice(0, 10)}`;
  if (formato === "csv") return { nome: `${nome}.csv`, tipo: "text/csv; charset=utf-8", corpo: Buffer.from(gerarCsv(linhas, colunas), "utf8") };
  const corpo = await gerarXlsx([{ nome: tipo, linhas, colunas }], metadadosExportacao(tipo, fu, fi));
  return { nome: `${nome}.xlsx`, tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", corpo };
}

export function metadadosExportacao(tipo: string, fu: FiltrosUniverso, fi: Partial<FiltrosIniciativas>) {
  return {
    "Fonte": "ONISMU — Observatório Nacional de Iniciativas de Saúde Mental nas Universidades Brasileiras",
    "Conjunto": tipo,
    "Gerado em": new Date().toISOString(),
    "Filtros": JSON.stringify({ ...fu, ...fi }),
    "Escopo": "Somente registros validados por pesquisador(a). Dados demonstrativos excluídos, salvo indicação nos filtros.",
    "Atenção": "A cobertura depende das fontes consultadas. 'Sem iniciativas localizadas' não significa ausência de iniciativas.",
    "Escala de evidência": "1 Política formalizada; 2 Programa institucional estruturado; 3 Serviço ou ação institucional; 4 Evidência insuficiente (não mede qualidade).",
    "Documentos normativos": TIPOS_DOCUMENTO_NORMATIVO.join(", "),
    ...(URL_PUBLICA ? { "Endereço": URL_PUBLICA } : {}),
  };
}

/** Exportação administrativa completa (inclui registros não validados e trilhas de coleta). */
export async function exportarBaseCompleta(): Promise<Buffer> {
  const q = async (sql: string) => (await pool.query(sql)).rows;
  const tabelas = ["universidades", "campi", "categorias", "publicos_alvo", "iniciativas", "iniciativa_categorias_secundarias",
    "iniciativa_publicos", "iniciativa_relacoes", "documentos", "iniciativa_documentos", "fontes", "evidencias",
    "coleta_execucoes", "coleta_paginas", "candidatos", "possiveis_duplicidades", "historico_alteracoes", "tarefas_atualizacao"];
  const abas = [];
  for (const t of tabelas) {
    const linhas = await q(`SELECT * FROM ${t} ORDER BY 1`);
    const chaves = linhas[0] ? Object.keys(linhas[0]) : ["(vazio)"];
    abas.push({ nome: t, linhas, colunas: chaves.map((k) => ({ chave: k, titulo: k, valor: (r: any) => r[k] })) });
  }
  return gerarXlsx(abas, { "Conteúdo": "Base completa ONISMU (uso administrativo, inclui registros não validados)", "Gerado em": new Date().toISOString() });
}
