/**
 * Testa o extrator configurado numa URL real, sem gravar nada no banco.
 * Uso: npm run testar:extracao -w server -- <url> [--sigla FURG]
 */
import { extrairConteudo } from "../coleta/conteudo.js";
import { dependenciasPadrao } from "../coleta/pipeline.js";
import { buscarSeguro } from "../coleta/fetcher.js";
import { paginaRelevante } from "../coleta/extrator-heuristico.js";
import { validarCandidato } from "../coleta/validacao.js";
import { pool } from "../db.js";
import { pertenceAoDominio } from "../lib/url.js";

const url = process.argv.find((a) => /^https?:\/\//.test(a));
const i = process.argv.indexOf("--sigla");
if (!url) { console.error("Informe uma URL."); process.exit(1); }
const u = i > -1
  ? (await pool.query("SELECT nome_oficial, sigla, dominio FROM universidades WHERE upper(sigla) = upper($1)", [process.argv[i + 1]])).rows[0]
  : { nome_oficial: "Universidade não informada", sigla: null, dominio: null };
const { extrator } = dependenciasPadrao();
const r = await buscarSeguro(url);
const c = await extrairConteudo(r);
const oficial = pertenceAoDominio(r.urlFinal, u.dominio);
console.log(`Página: ${c.titulo} (${c.tipo}, ${c.texto.length} caracteres) · relevante por termos: ${paginaRelevante(c.texto)} · extrator: ${extrator.nome}`);
const t0 = Date.now();
const res = await extrator.extrair({ universidade: u, url: r.urlFinal, titulo: c.titulo, texto: c.texto, ehDominioOficial: oficial });
console.log(`Tempo de extração: ${((Date.now() - t0) / 1000).toFixed(1)} s · página relevante (modelo): ${res.pagina_relevante} · sugeridos: ${res.iniciativas.length}`);
for (const ini of res.iniciativas) {
  const v = validarCandidato(ini, c.texto, oficial);
  console.log(`\n${v.aceito ? "ACEITO   " : "DESCARTADO"} ${ini.nome}  [${v.candidato.categoria_sugerida}, nível ${v.candidato.grau_evidencia_sugerido}, confiança ${ini.confianca}]`);
  console.log(`  trecho: "${ini.trecho_evidencia.slice(0, 220)}"`);
  if (!v.aceito) console.log(`  motivo: ${v.motivoDescarte}`);
  for (const a of v.avisos) console.log(`  aviso: ${a}`);
}
if (res.observacoes) console.log(`\nObservações: ${res.observacoes}`);
await pool.end();
