/**
 * Importa lotes de pesquisa-piloto (data/piloto/*.json) como EXECUÇÕES DE COLETA e CANDIDATOS PENDENTES.
 * Nada é publicado: cada candidato precisa ser revisado por um pesquisador na fila administrativa.
 * Idempotente por identificador de execução (PILOTO-<lote>-<SIGLA>).
 * Uso: npm run importar:piloto -w server [-- arquivo1.json arquivo2.json]
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RAIZ_PROJETO } from "../config.js";
import { pool, transacao } from "../db.js";
import { TIPOS_FONTE } from "../dominio.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { normalizarTexto } from "../lib/texto.js";
import { validarUrlPublica } from "../lib/url.js";
import { CODIGOS_CATEGORIA } from "../coleta/esquema.js";
import { sugerirDuplicatas } from "../services/candidatos.js";

const candidatoSchema = z.object({
  nome: z.string().min(3).max(300),
  categoria_sugerida: z.enum(CODIGOS_CATEGORIA),
  categorias_secundarias: z.array(z.enum(CODIGOS_CATEGORIA)).default([]),
  url_fonte: z.string().refine((u) => { try { validarUrlPublica(u); return true; } catch { return false; } }, "URL inválida"),
  titulo_fonte: z.string().nullable().optional(),
  tipo_fonte: z.enum(TIPOS_FONTE),
  trecho_evidencia: z.string().min(15),
  grau_evidencia_sugerido: z.number().int().min(1).max(4),
  confianca: z.enum(["alta", "media", "baixa"]),
  campos_ausentes: z.array(z.string()).default([]),
  justificativa: z.string().nullable().optional(),
}).passthrough();

const loteSchema = z.object({
  lote: z.string().regex(/^[a-z0-9_-]+$/i),
  executado_em: z.string().datetime({ offset: true }),
  ferramenta: z.string(),
  universidades: z.array(z.object({
    sigla: z.string(),
    nome_oficial: z.string(),
    dominio: z.string().nullable().optional(),
    consultas: z.array(z.string()).default([]),
    fontes_consultadas: z.array(z.object({ url: z.string(), titulo: z.string().nullable().optional(), acessada: z.boolean(), observacao: z.string().nullable().optional() })).default([]),
    resultado: z.enum(["com_iniciativas", "sem_iniciativas", "inconclusiva"]),
    pendencias: z.array(z.string()).default([]),
    candidatos: z.array(z.unknown()),
  })),
});

const args = process.argv.slice(2).filter((a) => a.endsWith(".json"));
const pasta = path.join(RAIZ_PROJETO, "data", "piloto");
const arquivos = args.length ? args.map((a) => path.resolve(a)) : fs.readdirSync(pasta).filter((f) => f.endsWith(".json")).map((f) => path.join(pasta, f));

async function localizarUniversidade(sigla: string, nome: string) {
  const r = await pool.query(
    `SELECT id, sigla, nome_oficial, dominio, situacao_pesquisa FROM universidades
      WHERE upper(sigla) = upper($1) OR f_normalizar(nome_oficial) = f_normalizar($2)`, [sigla, nome]);
  if (r.rowCount === 1) return r.rows[0];
  const porNome = r.rows.find((u) => normalizarTexto(u.nome_oficial) === normalizarTexto(nome));
  return porNome ?? null;
}

for (const arq of arquivos) {
  const lote = loteSchema.parse(JSON.parse(fs.readFileSync(arq, "utf8")));
  console.log(`\nLote "${lote.lote}" (${path.basename(arq)}) — ${lote.universidades.length} universidades`);
  for (const uni of lote.universidades) {
    const u = await localizarUniversidade(uni.sigla, uni.nome_oficial);
    if (!u) { console.log(`  ! ${uni.sigla}: universidade não encontrada no universo institucional — ignorada`); continue; }
    const identificador = `PILOTO-${lote.lote.toUpperCase()}-${uni.sigla.toUpperCase()}`;
    if ((await pool.query("SELECT 1 FROM coleta_execucoes WHERE identificador = $1", [identificador])).rowCount) {
      console.log(`  = ${uni.sigla}: já importado (${identificador})`); continue;
    }
    const rejeitados: string[] = [];
    let aceitos = 0;
    await transacao(async (c) => {
      if (uni.dominio && !u.dominio) {
        await c.query("UPDATE universidades SET dominio = $2 WHERE id = $1", [u.id, uni.dominio.toLowerCase()]);
        await registrarAlteracoes(c, "universidades", u.id, { dominio: null }, { dominio: uni.dominio }, null, `Domínio identificado na pesquisa-piloto (${identificador})`);
      }
      const acessadas = uni.fontes_consultadas.filter((f) => f.acessada).length;
      const exec = (await c.query(
        `INSERT INTO coleta_execucoes (identificador, universidade_id, modo, ferramenta, status, termos_busca, paginas_examinadas,
                                       pendencias, resultado_declarado, iniciada_em, finalizada_em, observacoes)
         VALUES ($1,$2,'importacao_piloto',$3,'concluida',$4,$5,$6,$7,$8,$8,$9) RETURNING id`,
        [identificador, u.id, lote.ferramenta, uni.consultas, uni.fontes_consultadas.length, uni.pendencias, uni.resultado, lote.executado_em,
          `Importado de ${path.basename(arq)}. Fontes acessadas: ${acessadas}/${uni.fontes_consultadas.length}. Trechos a reverificar pelo sistema.`],
      )).rows[0];
      const paginaPorUrl = new Map<string, number>();
      for (const f of uni.fontes_consultadas) {
        const p = await c.query(
          `INSERT INTO coleta_paginas (execucao_id, url, titulo, origem, status, observacao, consultada_em)
           VALUES ($1,$2,$3,'piloto',$4,$5,$6) RETURNING id`,
          [exec.id, f.url, f.titulo ?? null, f.acessada ? "consultada" : "erro", f.observacao ?? null, lote.executado_em]);
        paginaPorUrl.set(f.url, p.rows[0].id);
      }
      for (const [n, bruto] of uni.candidatos.entries()) {
        const v = candidatoSchema.safeParse(bruto);
        if (!v.success) { rejeitados.push(`#${n + 1}: ${v.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`); continue; }
        const d = v.data as any;
        let paginaId = paginaPorUrl.get(d.url_fonte);
        if (!paginaId) {
          const p = await c.query(
            `INSERT INTO coleta_paginas (execucao_id, url, titulo, origem, status, observacao, consultada_em)
             VALUES ($1,$2,$3,'piloto','consultada','Fonte do candidato (não listada em fontes_consultadas)',$4) RETURNING id`,
            [exec.id, d.url_fonte, d.titulo_fonte ?? null, lote.executado_em]);
          paginaId = p.rows[0].id;
          paginaPorUrl.set(d.url_fonte, paginaId!);
        }
        const dup = await sugerirDuplicatas(c, u.id, d.nome, d.url_fonte);
        await c.query(
          `INSERT INTO candidatos (execucao_id, universidade_id, pagina_id, extrator, dados, nome, categoria_sugerida, url_fonte, titulo_fonte,
              tipo_fonte, trecho_evidencia, grau_evidencia_sugerido, confianca, campos_ausentes, justificativa, possiveis_duplicatas)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [exec.id, u.id, paginaId, `piloto:${lote.ferramenta}`, d, d.nome, d.categoria_sugerida, d.url_fonte, d.titulo_fonte ?? null,
            d.tipo_fonte, d.trecho_evidencia, d.grau_evidencia_sugerido, d.confianca, d.campos_ausentes, d.justificativa ?? null, JSON.stringify(dup)]);
        aceitos++;
      }
      await c.query("UPDATE coleta_execucoes SET candidatos_encontrados = $2, erros = $3 WHERE id = $1",
        [exec.id, aceitos, JSON.stringify(rejeitados.map((r) => ({ etapa: "importacao", erro: r })))]);
      if (acessadas > 0 && u.situacao_pesquisa !== "aguardando_validacao") {
        await c.query("UPDATE universidades SET situacao_pesquisa = 'aguardando_validacao', data_ultima_verificacao = $2 WHERE id = $1", [u.id, lote.executado_em]);
        await registrarAlteracoes(c, "universidades", u.id, { situacao_pesquisa: u.situacao_pesquisa }, { situacao_pesquisa: "aguardando_validacao" }, null, `Pesquisa-piloto importada (${identificador})`);
      }
    });
    console.log(`  + ${uni.sigla} → ${u.nome_oficial}: ${aceitos} candidatos${rejeitados.length ? `, ${rejeitados.length} rejeitados` : ""}`);
    for (const r of rejeitados) console.log(`      rejeitado ${r}`);
  }
}
await pool.end();
