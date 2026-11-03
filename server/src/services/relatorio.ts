import PDFDocument from "pdfkit";
import { pool } from "../db.js";
import { calcularIndicadores, filtrosUniverso, type FiltrosUniverso } from "./indicadores.js";

const ROTULOS_SITUACAO: Record<string, string> = {
  nao_pesquisada: "Não pesquisada",
  em_pesquisa: "Em pesquisa",
  aguardando_validacao: "Aguardando validação",
  concluida_com_iniciativas: "Concluída — com iniciativas identificadas",
  concluida_sem_iniciativas: "Concluída — sem iniciativas localizadas",
  inconclusiva: "Pesquisa inconclusiva",
};

const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);
const fmtData = (d: unknown) => (d ? new Date(d as string).toLocaleDateString("pt-BR") : "sem registro");

/** Relatório PDF com resumo, indicadores, gráfico de barras, metodologia, limitações e fontes. */
export async function gerarRelatorioPdf(f: FiltrosUniverso): Promise<Buffer> {
  const ind = await calcularIndicadores(f);
  const w = filtrosUniverso(f);
  w.addLiteral("i.status_validacao = 'validada'");
  if (!f.demo) w.addLiteral("i.origem_dados = 'real'");
  const fontes = (await pool.query(
    `SELECT DISTINCT ON (f.url_canonica) u.sigla, f.titulo, f.url_original, f.data_consulta
       FROM fontes f JOIN evidencias e ON e.fonte_id = f.id JOIN iniciativas i ON i.id = e.iniciativa_id
       JOIN universidades u ON u.id = i.universidade_id
      ${w.where}
      ORDER BY f.url_canonica LIMIT 300`,
    w.params,
  )).rows;

  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: "Relatório ONISMU", Author: "ONISMU" } });
  const partes: Buffer[] = [];
  doc.on("data", (b) => partes.push(b));
  const fim = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(partes))));

  const titulo = (t: string) => doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).fillColor("#1d3b53").text(t).moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#222");
  const par = (t: string) => doc.font("Helvetica").fontSize(10).fillColor("#222").text(t, { align: "justify" }).moveDown(0.3);

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#1d3b53")
    .text("Observatório Nacional de Iniciativas de Saúde Mental nas Universidades Brasileiras — ONISMU");
  doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#555")
    .text(`Relatório gerado em ${new Date().toLocaleString("pt-BR")} · Data de corte dos dados: ${fmtData(ind.data_atualizacao)}`);
  if (f.regiao.length || f.estado.length || f.categoria_administrativa.length)
    doc.text(`Filtros: ${[...f.regiao, ...f.estado, ...f.categoria_administrativa].join(", ")}`);
  if (f.demo) doc.fillColor("#b00020").text("ATENÇÃO: este relatório inclui DADOS DEMONSTRATIVOS (fictícios).");

  titulo("Resumo executivo");
  par(
    `O universo institucional considerado reúne ${ind.universo} universidades. Até a data de corte, ${ind.concluidas} tiveram a pesquisa ` +
    `documental concluída (cobertura de ${fmtPct(ind.indicadores.cobertura_pesquisa.valor)}). Foram validadas ${ind.iniciativas_validadas} ` +
    `iniciativas, das quais ${ind.politicas_formalizadas} correspondem a políticas formalizadas (Nível 1). ` +
    `${ind.em_validacao.candidatos_pendentes} registros sugeridos pela coleta aguardam revisão e não estão incluídos nos números.`,
  );
  if (ind.cobertura_incompleta)
    par("A cobertura nacional está INCOMPLETA: os resultados descrevem apenas as instituições pesquisadas e não devem ser generalizados.");

  titulo("Indicadores");
  for (const [nome, i] of Object.entries(ind.indicadores)) {
    doc.font("Helvetica-Bold").text(`${nome.replace(/_/g, " ")}: ${fmtPct(i.valor)} (${i.numerador} de ${i.denominador})`);
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(`Fórmula: ${i.formula}`).fontSize(10).fillColor("#222").moveDown(0.2);
  }
  titulo("Situação da pesquisa (matriz de cobertura)");
  for (const [k, v] of Object.entries(ind.situacao_pesquisa)) par(`${ROTULOS_SITUACAO[k]}: ${v} de ${ind.universo}`);

  titulo(`Iniciativas validadas por categoria (base: ${ind.por_categoria.denominador})`);
  const max = Math.max(1, ...ind.por_categoria.itens.map((c) => c.n));
  const x0 = doc.page.margins.left;
  for (const c of ind.por_categoria.itens) {
    const y = doc.y;
    doc.fontSize(9).fillColor("#222").text(c.nome, x0, y, { width: 170 });
    const largura = (c.n / max) * 250;
    doc.rect(x0 + 180, y + 1, Math.max(largura, 0.5), 9).fill("#2f6f8f");
    doc.fillColor("#222").text(`${c.n} (${fmtPct(c.percentual)})`, x0 + 190 + largura, y);
    doc.moveDown(0.5);
  }
  doc.x = x0;

  titulo("Metodologia (síntese)");
  par("O universo institucional é formado pelas instituições com organização acadêmica 'Universidade' nos Microdados do Censo da Educação Superior (INEP). Para cada universidade, a coleta combina buscas por termos controlados e consulta a fontes oficiais; a IA (quando habilitada) apenas sugere candidatos, que só são publicados após revisão humana com fonte e trecho comprobatório.");
  par("Escala documental: 1 — política formalizada; 2 — programa institucional estruturado; 3 — serviço ou ação institucional; 4 — evidência insuficiente. A escala mede a documentação disponível, não a qualidade do cuidado.");
  titulo("Limitações");
  par("A ausência de registro não significa ausência de iniciativa: 'sem iniciativas localizadas' indica apenas que nada foi identificado nas fontes consultadas. A quantidade de iniciativas não é medida de qualidade assistencial, e o observatório não produz rankings.");

  titulo(`Fontes das iniciativas validadas (${fontes.length}${fontes.length === 300 ? "+" : ""})`);
  doc.fontSize(8);
  for (const s of fontes) doc.fillColor("#222").text(`[${s.sigla ?? "—"}] ${s.titulo ?? "sem título"} — ${s.url_original} (consulta: ${fmtData(s.data_consulta)})`).moveDown(0.15);
  if (!fontes.length) doc.text("Nenhuma iniciativa validada até o momento.");
  doc.end();
  return fim;
}
