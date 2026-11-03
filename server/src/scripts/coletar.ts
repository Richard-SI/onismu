/**
 * Executa uma coleta pela linha de comando (mesmo pipeline da tela "Coleta").
 * Uso: npm run coletar -w server -- --sigla FURG [--urls url1,url2] [--max-paginas 10]
 * Sem --urls, usa a busca configurada (BUSCA_PROVEDOR). Os candidatos ficam pendentes na fila de revisão.
 */
import { criarExecucao } from "../coleta/fila.js";
import { executarColeta } from "../coleta/pipeline.js";
import { config } from "../config.js";
import { pool } from "../db.js";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const sigla = arg("sigla");
if (!sigla) { console.error("Uso: npm run coletar -w server -- --sigla SIGLA [--urls a,b] [--max-paginas N]"); process.exit(1); }
if (arg("max-paginas")) (config as any).COLETA_MAX_PAGINAS = Number(arg("max-paginas"));
const u = (await pool.query("SELECT id, nome_oficial, dominio FROM universidades WHERE upper(sigla) = upper($1) AND origem_dados = 'real'", [sigla])).rows;
if (u.length !== 1) { console.error(`Sigla ${sigla}: ${u.length} universidades encontradas.`); process.exit(1); }
const urls = arg("urls")?.split(",").filter(Boolean);
const e = await criarExecucao({ universidade_id: u[0].id, modo: urls ? "urls_manuais" : "busca_api", urls, observacoes: "Execução pela linha de comando" }, null);
console.log(`${e.identificador} · ${u[0].nome_oficial} · domínio ${u[0].dominio ?? "não informado"} · busca ${config.BUSCA_PROVEDOR} · extrator ${config.EXTRATOR} · até ${config.COLETA_MAX_PAGINAS} páginas`);
const t0 = Date.now();
await executarColeta(e.id);
const r = (await pool.query("SELECT status, paginas_examinadas, candidatos_encontrados, erros, pendencias, cardinality(termos_busca) AS consultas FROM coleta_execucoes WHERE id = $1", [e.id])).rows[0];
const pag = (await pool.query("SELECT status, count(*) AS n FROM coleta_paginas WHERE execucao_id = $1 GROUP BY 1 ORDER BY 2 DESC", [e.id])).rows;
console.log(`\nStatus: ${r.status} em ${((Date.now() - t0) / 60000).toFixed(1)} min · consultas: ${r.consultas} · páginas examinadas: ${r.paginas_examinadas} · candidatos: ${r.candidatos_encontrados}`);
console.log("Páginas por situação:", Object.fromEntries(pag.map((p) => [p.status, p.n])));
for (const x of r.erros.slice(0, 10)) console.log("  erro:", x.url ?? x.consulta ?? "", "—", x.erro);
for (const p of r.pendencias) console.log("  pendência:", p);
const cands = (await pool.query("SELECT id, nome, categoria_sugerida, jsonb_array_length(possiveis_duplicatas) AS dup FROM candidatos WHERE execucao_id = $1 ORDER BY id", [e.id])).rows;
for (const c of cands) console.log(`  #${c.id} [${c.categoria_sugerida}] ${c.nome}${c.dup ? `  (possíveis duplicatas: ${c.dup})` : ""}`);
await pool.end();
