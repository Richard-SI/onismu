import { z } from "zod";
import { pool } from "../db.js";
import { TIPOS_DOCUMENTO_NORMATIVO } from "../dominio.js";
import { ErroHttp } from "../lib/erros.js";
import { offsetDe, respostaPaginada } from "../lib/paginacao.js";
import type { esquemaFiltrosUniversidades } from "../routes/filtros.js";
import { filtrosUniverso } from "./indicadores.js";
import { listarIniciativas } from "./iniciativas.js";

type F = z.infer<typeof esquemaFiltrosUniversidades>;

const ORDEM: Record<string, string> = {
  nome: "f_normalizar(u.nome_oficial)",
  estado: "u.estado, f_normalizar(u.nome_oficial)",
  iniciativas: "iniciativas_validadas DESC, f_normalizar(u.nome_oficial)",
  verificacao: "u.data_ultima_verificacao DESC NULLS LAST, f_normalizar(u.nome_oficial)",
};

export async function listarUniversidades(f: F) {
  const w = filtrosUniverso(f);
  if (f.q) w.add((p) => `f_normalizar(u.nome_oficial || ' ' || coalesce(u.sigla,'') || ' ' || coalesce(u.municipio,'')) LIKE f_normalizar(${p})`, `%${f.q}%`);
  if (f.situacao_pesquisa.length) w.add((p) => `u.situacao_pesquisa = ANY(${p})`, f.situacao_pesquisa);
  const valid = `i.status_validacao = 'validada' ${f.demo ? "" : "AND i.origem_dados = 'real'"}`;
  const [itens, total] = await Promise.all([
    pool.query(
      `SELECT u.id, u.nome_oficial, u.sigla, u.codigo_institucional, u.categoria_administrativa, u.subcategoria, u.regiao, u.estado,
              u.municipio, u.site_oficial, u.situacao_pesquisa, u.data_ultima_verificacao, u.origem_dados,
              (SELECT count(*) FROM iniciativas i WHERE i.universidade_id = u.id AND ${valid}) AS iniciativas_validadas
         FROM universidades u ${w.where}
        ORDER BY ${ORDEM[f.ordenar ?? "estado"]} LIMIT ${f.por_pagina} OFFSET ${offsetDe(f)}`, w.params),
    pool.query<{ n: number }>(`SELECT count(*) AS n FROM universidades u ${w.where}`, w.params),
  ]);
  return respostaPaginada(itens.rows, total.rows[0].n, f);
}

/** Detalhe público: identificação, situação, iniciativas validadas por tipo, documentos, fontes e pendências de cobertura. */
export async function detalharUniversidade(id: number, demo = false) {
  const u = (await pool.query(
    `SELECT u.id, u.nome_oficial, u.sigla, u.codigo_institucional, u.categoria_administrativa, u.subcategoria, u.organizacao_academica,
            u.regiao, u.estado, u.municipio, u.site_oficial, u.situacao_pesquisa, u.data_ultima_verificacao, u.fonte_cadastro,
            u.ano_referencia_cadastro, u.origem_dados
       FROM universidades u WHERE u.id = $1 ${demo ? "" : "AND u.origem_dados = 'real'"}`, [id],
  )).rows[0];
  if (!u) throw new ErroHttp(404, "Universidade não encontrada.");
  const vazio = { universidade_id: [id], regiao: [], estado: [], categoria: [], publico: [], situacao_documentada: [], grau_evidencia: [], categoria_administrativa: [], status_validacao: [], demo };
  const [iniciativas, documentos, fontes, coleta, campi] = await Promise.all([
    listarIniciativas({ ...vazio, ordenar: "grau" }, null, true),
    pool.query(
      `SELECT DISTINCT d.id, d.titulo, d.tipo_documento, d.numero_documento, d.data_publicacao, d.orgao_emissor, d.url_original,
              d.tipo_documento = ANY($2) AS normativo
         FROM documentos d JOIN iniciativa_documentos idoc ON idoc.documento_id = d.id JOIN iniciativas i ON i.id = idoc.iniciativa_id
        WHERE d.universidade_id = $1 AND i.status_validacao = 'validada' ORDER BY d.data_publicacao DESC NULLS LAST`, [id, TIPOS_DOCUMENTO_NORMATIVO]),
    pool.query(
      `SELECT DISTINCT f.id, f.titulo, f.url_original, f.tipo_fonte, f.data_consulta, f.situacao_fonte
         FROM fontes f JOIN evidencias e ON e.fonte_id = f.id JOIN iniciativas i ON i.id = e.iniciativa_id
        WHERE i.universidade_id = $1 AND i.status_validacao = 'validada' ORDER BY f.data_consulta DESC`, [id]),
    // Resumo público da coleta: sem logs detalhados, sem candidatos e sem responsáveis.
    pool.query(
      `SELECT count(*) FILTER (WHERE status IN ('concluida', 'parcial')) AS execucoes_concluidas,
              max(finalizada_em) AS ultima_execucao,
              (SELECT count(*) FROM coleta_paginas p JOIN coleta_execucoes e2 ON e2.id = p.execucao_id
                WHERE e2.universidade_id = $1 AND p.status IN ('relevante', 'sem_termos', 'consultada')) AS fontes_consultadas,
              (SELECT count(*) FROM candidatos c WHERE c.universidade_id = $1 AND c.status = 'pendente') AS registros_em_validacao
         FROM coleta_execucoes WHERE universidade_id = $1`, [id]),
    pool.query("SELECT id, nome, municipio, estado FROM campi WHERE universidade_id = $1 ORDER BY nome", [id]),
  ]);
  const c = coleta.rows[0];
  const pendencias: string[] = [];
  if (u.situacao_pesquisa === "nao_pesquisada") pendencias.push("Instituição ainda não pesquisada.");
  if (u.situacao_pesquisa === "em_pesquisa") pendencias.push("Coleta em andamento.");
  if (u.situacao_pesquisa === "aguardando_validacao") pendencias.push("Resultados da coleta aguardando validação por pesquisador(a).");
  if (u.situacao_pesquisa === "inconclusiva") pendencias.push("Pesquisa inconclusiva: fontes insuficientes ou inacessíveis.");
  if (c.registros_em_validacao > 0) pendencias.push(`${c.registros_em_validacao} registro(s) sugerido(s) em validação (não exibidos).`);
  if (!u.site_oficial) pendencias.push("Site oficial não informado no cadastro de origem.");
  return { ...u, campi: campi.rows, iniciativas: iniciativas.itens, documentos: documentos.rows, fontes: fontes.rows, coleta: c, pendencias };
}
