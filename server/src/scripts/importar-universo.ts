/**
 * Importa o universo institucional a partir de data/universo/universidades.csv (INEP/e-MEC).
 * Idempotente: atualiza pelo código institucional; nunca altera situação de pesquisa já registrada.
 * Uso: npm run importar:universo -w server [-- --arquivo caminho.csv]
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RAIZ_PROJETO } from "../config.js";
import { pool, transacao } from "../db.js";
import { CATEGORIAS_ADMINISTRATIVAS } from "../dominio.js";
import { lerCsv } from "../lib/csv-leitura.js";
import { regiaoDaUf, UFS } from "../lib/geografia.js";
import { registrarAlteracoes } from "../lib/historico.js";
import { capitalizarNome } from "../lib/texto.js";
import { dominioDe } from "../lib/url.js";

const i = process.argv.indexOf("--arquivo");
const arquivo = i > -1 ? path.resolve(process.argv[i + 1]) : path.join(RAIZ_PROJETO, "data", "universo", "universidades.csv");

const linhaSchema = z.object({
  codigo_emec: z.coerce.number().int().positive(),
  nome_oficial: z.string().min(5),
  sigla: z.string().optional(),
  categoria_administrativa: z.enum(CATEGORIAS_ADMINISTRATIVAS),
  organizacao_academica: z.string().refine((v) => v.toLowerCase() === "universidade", "Somente universidades"),
  uf: z.string().refine((v) => v in UFS, "UF inválida"),
  municipio: z.string().optional(),
  site_oficial: z.string().optional(),
  fonte: z.string().min(5),
  ano_referencia: z.coerce.number().int().optional(),
  subcategoria: z.string().optional(),
});

const linhas = lerCsv(fs.readFileSync(arquivo, "utf8"));
let novos = 0, atualizados = 0;
const erros: string[] = [];
await transacao(async (c) => {
  for (const [n, bruta] of linhas.entries()) {
    const v = linhaSchema.safeParse(bruta);
    if (!v.success) { erros.push(`linha ${n + 2}: ${v.error.issues.map((x) => x.message).join("; ")}`); continue; }
    const d = v.data;
    const site = d.site_oficial ? (d.site_oficial.startsWith("http") ? d.site_oficial : `https://${d.site_oficial}`) : null;
    const valores = {
      nome_oficial: capitalizarNome(d.nome_oficial),
      sigla: d.sigla || null,
      categoria_administrativa: d.categoria_administrativa,
      subcategoria: d.subcategoria || null,
      regiao: regiaoDaUf(d.uf),
      estado: d.uf,
      municipio: d.municipio || null,
      fonte_cadastro: d.fonte,
      ano_referencia_cadastro: d.ano_referencia ?? null,
    };
    const antes = (await c.query("SELECT * FROM universidades WHERE codigo_institucional = $1", [d.codigo_emec])).rows[0];
    if (antes) {
      const r = await c.query(
        `UPDATE universidades SET nome_oficial=$2, sigla=coalesce($3, sigla), categoria_administrativa=$4, subcategoria=$5, regiao=$6, estado=$7,
                municipio=$8, fonte_cadastro=$9, ano_referencia_cadastro=$10, site_oficial=coalesce($11, site_oficial),
                dominio=coalesce(dominio, $12)
          WHERE id = $1 RETURNING *`,
        [antes.id, ...Object.values(valores), site, site ? dominioDe(site) : null]);
      const n = await registrarAlteracoes(c, "universidades", antes.id, antes, r.rows[0], null, `Importação do universo (${path.basename(arquivo)})`);
      if (n) atualizados++;
    } else {
      const r = await c.query(
        `INSERT INTO universidades (codigo_institucional, nome_oficial, sigla, categoria_administrativa, subcategoria, regiao, estado, municipio,
                                    fonte_cadastro, ano_referencia_cadastro, site_oficial, dominio)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [d.codigo_emec, ...Object.values(valores), site, site ? dominioDe(site) : null]);
      await registrarAlteracoes(c, "universidades", r.rows[0].id, null, r.rows[0], null, `Importação do universo (${path.basename(arquivo)})`);
      novos++;
    }
  }
});
console.log(`Universo: ${linhas.length} linhas · ${novos} novas · ${atualizados} atualizadas · ${erros.length} rejeitadas`);
for (const e of erros) console.log("  " + e);
await pool.end();
