/**
 * Dados DEMONSTRATIVOS (fictícios) para conhecer a interface. Todos os registros recebem
 * origem_dados = 'demonstrativo', nomes explicitamente fictícios e fontes em example.org.
 * Ficam ocultos da consulta pública por padrão (só aparecem com o parâmetro demo=true).
 * Uso: npm run seed:demo -w server      |   remover: npm run remover:demo -w server
 */
import { pool, transacao } from "../db.js";
import { criarIniciativa } from "../services/iniciativas.js";

if (process.argv.includes("--remover")) {
  await transacao(async (c) => {
    const ini = await c.query("DELETE FROM iniciativas WHERE origem_dados = 'demonstrativo' RETURNING id");
    await c.query("DELETE FROM fontes WHERE origem_dados = 'demonstrativo'");
    await c.query("DELETE FROM documentos WHERE origem_dados = 'demonstrativo'");
    const u = await c.query("DELETE FROM universidades WHERE origem_dados = 'demonstrativo' RETURNING id");
    console.log(`Removidos: ${u.rowCount} universidades e ${ini.rowCount} iniciativas demonstrativas.`);
  });
  await pool.end();
  process.exit(0);
}

const existentes = await pool.query("SELECT count(*) AS n FROM universidades WHERE origem_dados = 'demonstrativo'");
if (existentes.rows[0].n > 0) {
  console.log("Dados demonstrativos já existem. Use npm run remover:demo -w server para removê-los.");
  await pool.end();
  process.exit(0);
}

const UNIVERSIDADES = [
  { nome: "Universidade Demonstrativa do Cerrado (FICTÍCIA)", sigla: "UDC-DEMO", uf: "GO", regiao: "Centro-Oeste", cat: "publica_federal" },
  { nome: "Universidade Demonstrativa do Litoral (FICTÍCIA)", sigla: "UDL-DEMO", uf: "BA", regiao: "Nordeste", cat: "publica_estadual" },
  { nome: "Universidade Demonstrativa Comunitária (FICTÍCIA)", sigla: "UDCOM-DEMO", uf: "PR", regiao: "Sul", cat: "privada_sem_fins_lucrativos" },
];

const ev = (sigla: string, n: number) => [{
  url: `https://example.org/onismu-demo/${sigla.toLowerCase()}/${n}`,
  titulo: "Página fictícia de demonstração",
  tipo_fonte: "site_institucional",
  trecho_evidencia: "Trecho fictício usado apenas para demonstrar a interface do observatório (não é dado real).",
}];

await transacao(async (c) => {
  for (const [k, u] of UNIVERSIDADES.entries()) {
    const r = await c.query(
      `INSERT INTO universidades (nome_oficial, sigla, categoria_administrativa, regiao, estado, municipio, situacao_pesquisa,
                                  data_ultima_verificacao, fonte_cadastro, origem_dados)
       VALUES ($1,$2,$3,$4,$5,'Município Fictício', $6, now(), 'DADO DEMONSTRATIVO — fictício', 'demonstrativo') RETURNING id`,
      [u.nome, u.sigla, u.cat, u.regiao, u.uf, k === 2 ? "concluida_sem_iniciativas" : "concluida_com_iniciativas"]);
    if (k === 2) continue; // exemplo de "pesquisa concluída sem iniciativas localizadas"
    const uid = r.rows[0].id;
    const doc = await c.query(
      `INSERT INTO documentos (titulo, tipo_documento, numero_documento, data_publicacao, orgao_emissor, url_original, url_normalizada, universidade_id, origem_dados)
       VALUES ('Resolução fictícia que institui política de saúde mental (DEMO)', 'resolucao', '00/2025', '2025-03-10', 'Conselho Universitário (fictício)',
               $1, $2, $3, 'demonstrativo') RETURNING id`,
      [`https://example.org/onismu-demo/${u.sigla.toLowerCase()}/resolucao`, `example.org/onismu-demo/${u.sigla.toLowerCase()}/resolucao`, uid]);
    const base = { universidade_id: uid, status_validacao: "validada", situacao_documentada: "ativa" };
    await criarIniciativa(c, { ...base, nome: `Política de saúde mental — ${u.sigla}`, categoria_principal: "politica_institucional", grau_evidencia: 1,
      publicos: ["comunidade_universitaria"], abrangencia: "institucional", documentos_ids: [doc.rows[0].id], evidencias: ev(u.sigla, 1),
      descricao: "Registro fictício de demonstração." }, null, { origem: "demonstrativo" });
    await criarIniciativa(c, { ...base, nome: `Serviço de acolhimento psicológico — ${u.sigla}`, categoria_principal: "servico_permanente", grau_evidencia: 3,
      publicos: ["estudantes"], modalidade: "presencial", evidencias: ev(u.sigla, 2), descricao: "Registro fictício de demonstração." }, null, { origem: "demonstrativo" });
    await criarIniciativa(c, { ...base, nome: `Projeto de extensão rodas de conversa — ${u.sigla}`, categoria_principal: "projeto_extensao", grau_evidencia: 3,
      publicos: ["estudantes", "comunidade_externa"], evidencias: ev(u.sigla, 3), descricao: "Registro fictício de demonstração." }, null, { origem: "demonstrativo" });
    if (k === 0)
      await criarIniciativa(c, { ...base, nome: `Campanha Setembro Amarelo — ${u.sigla}`, categoria_principal: "acao_pontual", grau_evidencia: 3,
        situacao_documentada: "encerrada", publicos: ["comunidade_universitaria"], evidencias: ev(u.sigla, 4) }, null, { origem: "demonstrativo" });
  }
});
console.log("Dados demonstrativos criados (ocultos por padrão; visíveis com o seletor 'incluir dados demonstrativos').");
await pool.end();
