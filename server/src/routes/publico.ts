import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db.js";
import { GRAUS_EVIDENCIA, TIPOS_DOCUMENTO_NORMATIVO } from "../dominio.js";
import { assinc, ErroHttp } from "../lib/erros.js";
import { listaQuery } from "../lib/paginacao.js";
import { detalharUniversidade, listarUniversidades } from "../services/consultas-universidades.js";
import { gerarExportacao, TIPOS_EXPORTACAO } from "../services/exportacao.js";
import { calcularIndicadores, comparacaoTematica, compararUniversidades, dadosMapa } from "../services/indicadores.js";
import { detalharIniciativa, listarIniciativas } from "../services/iniciativas.js";
import { gerarRelatorioPdf } from "../services/relatorio.js";
import { esquemaFiltrosIniciativas, esquemaFiltrosUniversidades, esquemaFiltrosUniverso } from "./filtros.js";

/**
 * API pública — somente leitura. Expõe apenas iniciativas validadas; candidatos, logs de coleta,
 * usuários e históricos detalhados nunca são servidos por estas rotas.
 */
export const rotasPublicas = Router();

const id = z.coerce.number().int().positive();

rotasPublicas.get("/taxonomia", assinc(async (_req, res) => {
  const [categorias, publicos] = await Promise.all([
    pool.query("SELECT codigo, nome, descricao, inclui, ordem FROM categorias WHERE ativa ORDER BY ordem"),
    pool.query("SELECT codigo, nome, ordem FROM publicos_alvo ORDER BY ordem"),
  ]);
  res.json({ categorias: categorias.rows, publicos: publicos.rows, graus_evidencia: GRAUS_EVIDENCIA, tipos_documento_normativo: TIPOS_DOCUMENTO_NORMATIVO });
}));

rotasPublicas.get("/indicadores", assinc(async (req, res) => {
  res.json(await calcularIndicadores(esquemaFiltrosUniverso.parse(req.query)));
}));

rotasPublicas.get("/mapa", assinc(async (req, res) => {
  res.json(await dadosMapa(esquemaFiltrosUniverso.parse(req.query)));
}));

rotasPublicas.get("/universidades", assinc(async (req, res) => {
  res.json(await listarUniversidades(esquemaFiltrosUniversidades.parse(req.query)));
}));

rotasPublicas.get("/universidades/:id", assinc(async (req, res) => {
  const { demo } = esquemaFiltrosUniverso.parse(req.query);
  res.json(await detalharUniversidade(id.parse(req.params.id), demo));
}));

rotasPublicas.get("/iniciativas", assinc(async (req, res) => {
  const f = esquemaFiltrosIniciativas.parse(req.query);
  res.json(await listarIniciativas({ ...f, status_validacao: [] }, f, true));
}));

rotasPublicas.get("/iniciativas/:id", assinc(async (req, res) => {
  const { demo } = esquemaFiltrosUniverso.parse(req.query);
  res.json(await detalharIniciativa(id.parse(req.params.id), true, demo));
}));

rotasPublicas.get("/comparar", assinc(async (req, res) => {
  const q = z.object({ ids: listaQuery(z.coerce.number().int().positive()), demo: esquemaFiltrosUniverso.shape.demo }).parse(req.query);
  res.json(await compararUniversidades(q.ids, q.demo));
}));

rotasPublicas.get("/comparacao-tematica", assinc(async (req, res) => {
  res.json(await comparacaoTematica(esquemaFiltrosUniverso.parse(req.query)));
}));

/** Histórico público de atualizações (agregado; sem detalhes administrativos). */
rotasPublicas.get("/atualizacoes", assinc(async (_req, res) => {
  const r = await pool.query(
    `SELECT to_char(date_trunc('day', e.finalizada_em), 'YYYY-MM-DD') AS data, count(*) AS execucoes,
            count(DISTINCT e.universidade_id) AS universidades,
            array_agg(DISTINCT coalesce(u.sigla, u.nome_oficial)) AS instituicoes
       FROM coleta_execucoes e JOIN universidades u ON u.id = e.universidade_id
      WHERE e.status IN ('concluida', 'parcial') AND e.finalizada_em IS NOT NULL AND u.origem_dados = 'real'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 100`,
  );
  const validacoes = await pool.query(
    `SELECT to_char(date_trunc('day', validado_em), 'YYYY-MM-DD') AS data, count(*) AS iniciativas_validadas
       FROM iniciativas WHERE status_validacao = 'validada' AND origem_dados = 'real' AND validado_em IS NOT NULL
      GROUP BY 1 ORDER BY 1 DESC LIMIT 100`,
  );
  const demo = await pool.query("SELECT EXISTS (SELECT 1 FROM universidades WHERE origem_dados = 'demonstrativo') AS existe");
  res.json({ coletas: r.rows, validacoes: validacoes.rows, existem_dados_demonstrativos: demo.rows[0].existe });
}));

rotasPublicas.get("/exportar/:tipo.:formato", assinc(async (req, res) => {
  const tipo = z.enum(TIPOS_EXPORTACAO).parse(req.params.tipo);
  const formato = z.enum(["csv", "xlsx"]).parse(req.params.formato);
  const fi = esquemaFiltrosIniciativas.parse(req.query);
  const arq = await gerarExportacao(tipo, formato, fi, { ...fi, status_validacao: [] });
  res.setHeader("Content-Type", arq.tipo);
  res.setHeader("Content-Disposition", `attachment; filename="${arq.nome}"`);
  res.send(arq.corpo);
}));

rotasPublicas.get("/relatorio.pdf", assinc(async (req, res) => {
  const pdf = await gerarRelatorioPdf(esquemaFiltrosUniverso.parse(req.query));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="onismu_relatorio_${new Date().toISOString().slice(0, 10)}.pdf"`);
  res.send(pdf);
}));

const limiteRelatos = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { erro: "Muitos relatos enviados. Tente novamente mais tarde." } });

const esquemaRelato = z.object({
  tipo_registro: z.enum(["universidade", "iniciativa", "geral"]),
  registro_id: z.number().int().positive().optional().nullable(),
  descricao: z.string().trim().min(10).max(4000),
  url_referencia: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  contato: z.string().trim().max(200).optional().nullable(),
  site: z.string().max(0).optional(), // armadilha anti-robô (deve vir vazia)
});

/** Única rota pública de escrita: relatos de erro, que não alteram registros e vão para análise da equipe. */
rotasPublicas.post("/relatos", limiteRelatos, assinc(async (req, res) => {
  const d = esquemaRelato.parse(req.body);
  if (d.tipo_registro !== "geral" && !d.registro_id) throw new ErroHttp(400, "Informe o registro relacionado.");
  await pool.query(
    "INSERT INTO relatos_erro (tipo_registro, registro_id, descricao, url_referencia, contato) VALUES ($1,$2,$3,$4,$5)",
    [d.tipo_registro, d.registro_id ?? null, d.descricao, d.url_referencia || null, d.contato || null],
  );
  res.status(201).json({ mensagem: "Relato recebido. Obrigado por contribuir com a qualidade dos dados." });
}));
