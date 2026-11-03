import os from "node:os";
import { config } from "../config.js";
import { pool, transacao } from "../db.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { normalizarUrl, pertenceAoDominio } from "../lib/url.js";
import { sugerirDuplicatas } from "../services/candidatos.js";
import { gerarConsultas, provedorConfigurado, type ProvedorBusca, type ResultadoBusca } from "./busca.js";
import { extrairConteudo } from "./conteudo.js";
import type { Extrator } from "./esquema.js";
import { ExtratorClaude } from "./extrator-claude.js";
import { ExtratorHeuristico, paginaRelevante } from "./extrator-heuristico.js";
import { ExtratorOllama } from "./extrator-ollama.js";
import { aguardarVezDoHost, buscarSeguro, ErroColeta, permitidoPorRobots } from "./fetcher.js";
import { validarCandidato } from "./validacao.js";

export interface DependenciasColeta {
  provedor: ProvedorBusca | null;
  extrator: Extrator;
  respeitarRobots: boolean;
  intervaloHostMs?: number;
  intervaloBuscaMs?: number;
}

export function dependenciasPadrao(): DependenciasColeta {
  return {
    provedor: provedorConfigurado(),
    extrator: config.EXTRATOR === "claude" ? new ExtratorClaude() : config.EXTRATOR === "ollama" ? new ExtratorOllama() : new ExtratorHeuristico(),
    respeitarRobots: true,
  };
}

let dependenciasAtuais: (() => DependenciasColeta) = dependenciasPadrao;
/** Permite substituir provedor/extrator (usado nos testes, sem simular coletas reais em produção). */
export const definirDependenciasColeta = (f: () => DependenciasColeta) => { dependenciasAtuais = f; };
export const restaurarDependenciasColeta = () => { dependenciasAtuais = dependenciasPadrao; };

interface UrlAlvo { url: string; origem: "busca" | "manual"; consulta: string | null; titulo?: string; prioridade?: number }

const INSTITUCIONAL = /(\bprae\b|\bproae\b|\bprace\b|estudantil|sa[uú]de mental|psicol|psicossoc|acolh|bem estar|not[ií]cia|resolu|portaria|conselho|\bconsun|programa|n[uú]cleo|servi[cç]o)/i;
const NORMATIVO = /(resolu[cç]|portaria|instru[cç][aã]o normativa|regimento|pol[ií]tica)/i;
const ACADEMICO = /(repositorio|bdtd|tde_|\/bitstream\/|\/handle\/|tcc|disserta|tese|periodicos?\.|\/article\/|revista|ebook|e-book|anais|scielo|lume\.|teses\.)/i;

/**
 * Ordena as fontes candidatas: domínio oficial e páginas institucionais/normativas primeiro;
 * produção acadêmica (teses, TCCs, artigos, repositórios) por último — não descreve iniciativas institucionais.
 */
export function prioridadeDaFonte(r: { url: string; titulo?: string }, dominio: string | null): number {
  let url = r.url;
  try { url = decodeURIComponent(r.url); } catch { /* URL com escape inválido: usa como está */ }
  const texto = `${url.replace(/[-_/.?=&]+/g, " ")} ${r.titulo ?? ""}`;
  let p = 0;
  if (pertenceAoDominio(r.url, dominio)) p += 3;
  if (INSTITUCIONAL.test(texto)) p += 2;
  if (NORMATIVO.test(texto)) p += 2;
  if (ACADEMICO.test(`${url} ${r.titulo ?? ""}`)) p -= 5; // padrão usa pontos e barras da URL original
  return p;
}

const PAGINAS_DE_RESULTADO = 2; // percorre além da primeira página de resultados
const RESULTADOS_POR_PAGINA = 20;

async function descobrirUrls(prov: ProvedorBusca, u: any, erros: any[], intervaloMs: number): Promise<{ alvos: UrlAlvo[]; consultas: string[] }> {
  const consultas = gerarConsultas(u);
  const vistos = new Map<string, ResultadoBusca>();
  for (const consulta of consultas) {
    for (let pagina = 0; pagina < PAGINAS_DE_RESULTADO; pagina++) {
      try {
        if (intervaloMs) await new Promise((r) => setTimeout(r, intervaloMs)); // gentileza com os motores de busca
        const rs = await prov.buscar(consulta, { pagina, porPagina: RESULTADOS_POR_PAGINA });
        for (const r of rs) {
          try {
            const k = normalizarUrl(r.url);
            if (!vistos.has(k)) vistos.set(k, { ...r, consulta });
          } catch { /* URL inválida devolvida pela busca: ignorada */ }
        }
        if (rs.length < 10) break; // poucos resultados: não há próxima página útil
      } catch (e) {
        erros.push({ etapa: "busca", consulta, erro: (e as Error).message });
        break;
      }
    }
  }
  const alvos = [...vistos.values()]
    .map((r) => ({ url: r.url, origem: "busca" as const, consulta: r.consulta, titulo: r.titulo, prioridade: prioridadeDaFonte(r, u.dominio) }))
    .sort((a, b) => b.prioridade - a.prioridade);
  return { alvos, consultas };
}

async function registrarPagina(execId: number, alvo: UrlAlvo, dados: Record<string, unknown>) {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO coleta_paginas (execucao_id, url, url_final, titulo, origem, consulta, status, http_status, content_type, bytes, erro, observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [execId, alvo.url, dados.url_final ?? null, dados.titulo ?? alvo.titulo ?? null, alvo.origem, alvo.consulta,
      dados.status, dados.http_status ?? null, dados.content_type ?? null, dados.bytes ?? null, dados.erro ?? null, dados.observacao ?? null],
  );
  return r.rows[0].id;
}

/**
 * Executa uma coleta: descobre fontes (busca ou URLs informadas), baixa com segurança, extrai,
 * valida deterministicamente e grava CANDIDATOS pendentes. Nada é publicado aqui.
 */
export async function executarColeta(execId: number): Promise<void> {
  const deps = dependenciasAtuais();
  const exec = (await pool.query("SELECT * FROM coleta_execucoes WHERE id = $1", [execId])).rows[0];
  if (!exec) throw new Error(`Execução ${execId} inexistente.`);
  const u = (await pool.query("SELECT * FROM universidades WHERE id = $1", [exec.universidade_id])).rows[0];
  const situacaoAnterior = u.situacao_pesquisa;
  const erros: any[] = [];
  const pendencias: string[] = [];
  let examinadas = 0;
  let consultadasComSucesso = 0;
  let candidatos = 0;

  await pool.query("UPDATE coleta_execucoes SET status = 'em_andamento', ferramenta = $2, executor = $3 WHERE id = $1",
    [execId, `${exec.modo === "busca_api" ? deps.provedor?.nome ?? "sem-provedor" : "urls-informadas"} + ${deps.extrator.nome}`, `${os.hostname()}:${process.pid}`]);
  if (situacaoAnterior !== "em_pesquisa") {
    await pool.query("UPDATE universidades SET situacao_pesquisa = 'em_pesquisa' WHERE id = $1", [u.id]);
    await registrarAlteracoes(pool, "universidades", u.id, { situacao_pesquisa: situacaoAnterior }, { situacao_pesquisa: "em_pesquisa" }, exec.iniciada_por, `Coleta ${exec.identificador} iniciada`);
  }

  try {
    let alvos: UrlAlvo[] = [];
    if (exec.modo === "busca_api") {
      if (!deps.provedor) throw new Error("Nenhum provedor de busca configurado (defina BUSCA_PROVEDOR e a chave correspondente).");
      const d = await descobrirUrls(deps.provedor, u, erros, deps.intervaloBuscaMs ?? config.BUSCA_INTERVALO_MS);
      alvos = d.alvos;
      await pool.query("UPDATE coleta_execucoes SET termos_busca = $2 WHERE id = $1", [execId, d.consultas]);
    } else {
      alvos = (exec.urls_informadas as string[]).map((url) => ({ url, origem: "manual" as const, consulta: null }));
    }

    const limite = config.COLETA_MAX_PAGINAS;
    for (const alvo of alvos.slice(limite)) {
      await registrarPagina(execId, alvo, { status: "ignorada", observacao: `Não examinada: limite de ${limite} páginas por execução.` });
    }
    if (alvos.length > limite) pendencias.push(`${alvos.length - limite} resultado(s) não examinado(s) por limite de páginas; executar nova coleta.`);
    if (!alvos.length) pendencias.push("Nenhuma fonte candidata encontrada nesta execução.");

    for (const alvo of alvos.slice(0, limite)) {
      examinadas++;
      try {
        if (deps.respeitarRobots && !(await permitidoPorRobots(alvo.url))) {
          await registrarPagina(execId, alvo, { status: "bloqueada", observacao: "Acesso não permitido pelo robots.txt do site." });
          pendencias.push(`Consultar manualmente (robots.txt): ${alvo.url}`);
          continue;
        }
        await aguardarVezDoHost(alvo.url, deps.intervaloHostMs);
        const resp = await buscarSeguro(alvo.url);
        const conteudo = await extrairConteudo(resp);
        const base = { url_final: resp.urlFinal, titulo: conteudo.titulo, http_status: resp.status, content_type: resp.contentType, bytes: resp.corpo.length };
        consultadasComSucesso++;
        if (!paginaRelevante(conteudo.texto)) {
          await registrarPagina(execId, alvo, { ...base, status: "sem_termos", observacao: "Página consultada sem termos de saúde mental." });
          continue;
        }
        const oficial = pertenceAoDominio(resp.urlFinal, u.dominio);
        const extracao = await deps.extrator.extrair({
          universidade: { nome_oficial: u.nome_oficial, sigla: u.sigla, dominio: u.dominio },
          url: resp.urlFinal, titulo: conteudo.titulo, texto: conteudo.texto, ehDominioOficial: oficial,
        });
        const descartes: string[] = [];
        const paginaId = await registrarPagina(execId, alvo, {
          ...base, status: extracao.pagina_relevante ? "relevante" : "consultada",
          observacao: extracao.observacoes,
        });
        for (const bruto of extracao.iniciativas) {
          const v = validarCandidato(bruto, conteudo.texto, oficial);
          if (!v.aceito) { descartes.push(`${bruto.nome}: ${v.motivoDescarte}`); continue; }
          const c = v.candidato;
          await transacao(async (cx) => {
            const dup = await sugerirDuplicatas(cx, u.id, c.nome, resp.urlFinal);
            await cx.query(
              `INSERT INTO candidatos (execucao_id, universidade_id, pagina_id, extrator, dados, nome, categoria_sugerida, url_fonte, titulo_fonte,
                  tipo_fonte, trecho_evidencia, grau_evidencia_sugerido, confianca, campos_ausentes, justificativa, possiveis_duplicatas,
                  verificacao_trecho, verificacao_detalhe)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'confirmado',$17)`,
              [execId, u.id, paginaId, deps.extrator.nome,
                { ...c, data_publicacao_fonte: conteudo.dataPublicacao, avisos_validacao: v.avisos },
                c.nome, c.categoria_sugerida, resp.urlFinal, conteudo.titulo, c.tipo_fonte, c.trecho_evidencia,
                c.grau_evidencia_sugerido, c.confianca, c.campos_ausentes, c.justificativa, JSON.stringify(dup),
                `Trecho conferido automaticamente na coleta em ${new Date().toISOString()}`],
            );
          });
          candidatos++;
        }
        if (descartes.length) {
          await pool.query("UPDATE coleta_paginas SET observacao = coalesce(observacao || ' | ', '') || $2 WHERE id = $1",
            [paginaId, `Descartados pela validação: ${descartes.join("; ")}`]);
        }
      } catch (e) {
        const err = e as ErroColeta;
        await registrarPagina(execId, alvo, {
          status: err.codigo === "bloqueada" ? "bloqueada" : "erro", erro: err.message, http_status: err.status ?? null,
        });
        erros.push({ etapa: "pagina", url: alvo.url, erro: err.message });
      }
    }

    // Sem nenhuma página consultada (busca bloqueada ou todas as páginas com erro), a execução falhou.
    const status = consultadasComSucesso === 0 && (examinadas > 0 || erros.length > 0) ? "falhou" : erros.length ? "parcial" : "concluida";
    if (status === "falhou") pendencias.push("Nenhuma fonte pôde ser consultada; a universidade não deve ser considerada pesquisada.");
    await finalizar(execId, status, examinadas, candidatos, erros, pendencias);
    const novaSituacao = consultadasComSucesso > 0 ? "aguardando_validacao" : situacaoAnterior;
    await atualizarSituacaoPosColeta(u.id, novaSituacao, exec, consultadasComSucesso > 0);
  } catch (e) {
    erros.push({ etapa: "execucao", erro: (e as Error).message });
    await finalizar(execId, "falhou", examinadas, candidatos, erros, pendencias);
    await atualizarSituacaoPosColeta(u.id, situacaoAnterior, exec, false);
  }
}

async function finalizar(execId: number, status: string, examinadas: number, candidatos: number, erros: any[], pendencias: string[]) {
  await pool.query(
    `UPDATE coleta_execucoes SET status = $2, paginas_examinadas = $3, candidatos_encontrados = $4, erros = $5, pendencias = $6, finalizada_em = now()
      WHERE id = $1`,
    [execId, status, examinadas, candidatos, JSON.stringify(erros), pendencias],
  );
}

async function atualizarSituacaoPosColeta(universidadeId: number, nova: string, exec: any, consultou: boolean) {
  const atual = (await pool.query("SELECT situacao_pesquisa FROM universidades WHERE id = $1", [universidadeId])).rows[0].situacao_pesquisa;
  if (atual !== nova) {
    await pool.query("UPDATE universidades SET situacao_pesquisa = $2 WHERE id = $1", [universidadeId, nova]);
    await registrarAlteracoes(pool, "universidades", universidadeId, { situacao_pesquisa: atual }, { situacao_pesquisa: nova }, exec.iniciada_por, `Coleta ${exec.identificador} finalizada`);
  }
  if (consultou) await pool.query("UPDATE universidades SET data_ultima_verificacao = now() WHERE id = $1", [universidadeId]);
}
