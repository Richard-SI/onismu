/**
 * Aplica um arquivo de decisões de revisão (auditável e versionável) à fila de candidatos.
 * Uso: npm run aplicar:revisao -w server -- data/revisoes/arquivo.json [--simular]
 *
 * Formato: { "revisor": { "email", "nome" }, "nota_publica": "...", "decisoes": [
 *   { "candidato": 56, "acao": "aprovar", "edicoes": { ... }, "justificativa": "..." },
 *   { "candidato": 104, "acao": "vincular", "a_candidato": 56, "justificativa": "..." },
 *   { "candidato": 105, "acao": "rejeitar" | "inconclusivo", "motivo": "..." },
 *   { "relacao": { "origem_candidato": 110, "destino_candidato": 56, "tipo": "parte_de" } } ] }
 * "nota_publica" é acrescentada às limitações de cada iniciativa aprovada.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RAIZ_PROJETO } from "../config.js";
import { pool, transacao } from "../db.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { gerarHashSenha } from "../lib/senhas.js";
import {
  aprovarCandidato, entradaAPartirDoCandidato, marcarInconclusivo, rejeitarCandidato, vincularCandidato,
} from "../services/candidatos.js";

const decisao = z.union([
  z.object({ candidato: z.number().int(), acao: z.literal("aprovar"), edicoes: z.record(z.string(), z.unknown()).default({}), justificativa: z.string().min(5) }),
  z.object({ candidato: z.number().int(), acao: z.literal("vincular"), a_candidato: z.number().int(), justificativa: z.string().min(5) }),
  z.object({ candidato: z.number().int(), acao: z.enum(["rejeitar", "inconclusivo"]), motivo: z.string().min(5) }),
  z.object({ relacao: z.object({ origem_candidato: z.number().int(), destino_candidato: z.number().int(), tipo: z.enum(["vinculada_a_politica", "parte_de", "relacionada"]) }), justificativa: z.string().min(5) }),
]);
const arquivoSchema = z.object({
  revisor: z.object({ email: z.string().email(), nome: z.string().min(3) }),
  nota_publica: z.string().nullable().default(null),
  decisoes: z.array(decisao),
});

const caminho = process.argv.slice(2).find((a) => a.endsWith(".json"));
if (!caminho) { console.error("Informe o arquivo de decisões."); process.exit(1); }
const simular = process.argv.includes("--simular");
const dados = arquivoSchema.parse(JSON.parse(fs.readFileSync(path.resolve(RAIZ_PROJETO, caminho), "utf8")));

// Conta do revisor (sem senha utilizável: não permite login; serve para atribuir as decisões).
const revisor = (await pool.query(
  `INSERT INTO usuarios (email, nome, papel, senha_hash, ativo) VALUES ($1,$2,'pesquisador',$3,false)
   ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome RETURNING id`,
  [dados.revisor.email.toLowerCase(), dados.revisor.nome, await gerarHashSenha(crypto.randomBytes(32).toString("hex"))],
)).rows[0].id as number;

const iniciativaDoCandidato = async (ex: any, cid: number) => {
  const r = (await ex.query("SELECT iniciativa_id, status FROM candidatos WHERE id = $1", [cid])).rows[0];
  if (!r?.iniciativa_id) throw new Error(`Candidato #${cid} ainda não gerou iniciativa (status: ${r?.status ?? "inexistente"}).`);
  return r.iniciativa_id as number;
};

let ok = 0;
try {
  await transacao(async (c) => {
    for (const d of dados.decisoes) {
      if ("relacao" in d) {
        const origem = await iniciativaDoCandidato(c, d.relacao.origem_candidato);
        const destino = await iniciativaDoCandidato(c, d.relacao.destino_candidato);
        await c.query("INSERT INTO iniciativa_relacoes (origem_id, destino_id, tipo, observacao) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [origem, destino, d.relacao.tipo, d.justificativa]);
        await registrarAlteracoes(c, "iniciativas", origem, null, { relacao: `${d.relacao.tipo} → #${destino}` }, revisor, d.justificativa);
        console.log(`  relação  #${origem} ${d.relacao.tipo} #${destino}`);
      } else if (d.acao === "aprovar") {
        const cand = (await c.query("SELECT * FROM candidatos WHERE id = $1", [d.candidato])).rows[0];
        if (!cand) throw new Error(`Candidato #${d.candidato} inexistente.`);
        const base = entradaAPartirDoCandidato(cand).limitacoes as string | null;
        const limitacoes = [d.edicoes.limitacoes ?? base, dados.nota_publica].filter(Boolean).join(" ");
        const id = await aprovarCandidato(c, d.candidato, revisor, { ...d.edicoes, limitacoes: limitacoes || null }, d.justificativa);
        console.log(`  aprovado #${d.candidato} → iniciativa #${id}`);
      } else if (d.acao === "vincular") {
        await vincularCandidato(c, d.candidato, await iniciativaDoCandidato(c, d.a_candidato), revisor, d.justificativa);
        console.log(`  vinculado #${d.candidato} → candidato #${d.a_candidato}`);
      } else if (d.acao === "rejeitar") {
        await rejeitarCandidato(c, d.candidato, revisor, d.motivo);
        console.log(`  rejeitado #${d.candidato}`);
      } else {
        await marcarInconclusivo(c, d.candidato, revisor, d.motivo);
        console.log(`  inconclusivo #${d.candidato}`);
      }
      ok++;
    }
    if (simular) throw new Error("SIMULACAO");
  });
  console.log(`\n${ok} decisões aplicadas.`);
} catch (e) {
  if ((e as Error).message === "SIMULACAO") console.log(`\nSimulação: ${ok} decisões válidas; nada foi gravado.`);
  else { console.error(`\nNada foi gravado (transação desfeita). Erro após ${ok} decisões: ${(e as Error).message}`); process.exitCode = 1; }
}
await pool.end();
