import { normalizarTexto, trechoPresente } from "../lib/texto.js";
import type { CandidatoExtraido } from "./esquema.js";

export interface ResultadoValidacao {
  aceito: boolean;
  candidato: CandidatoExtraido;
  avisos: string[];
  motivoDescarte?: string;
}

const aparece = (valor: string, texto: string) => normalizarTexto(texto).includes(normalizarTexto(valor));

/**
 * Validação determinística pós-IA (proteção contra alucinações):
 * - o trecho de evidência precisa existir literalmente na fonte (senão o candidato é descartado);
 * - unidade responsável, número e título de documento, período e datas que não aparecem no texto são anulados;
 * - fontes fora do domínio oficial são marcadas como secundárias e não podem sugerir Nível 1;
 * - Nível 1 sem documento relacionado é rebaixado.
 */
export function validarCandidato(c: CandidatoExtraido, textoFonte: string, ehDominioOficial: boolean): ResultadoValidacao {
  const avisos: string[] = [];
  const x: CandidatoExtraido = structuredClone(c);
  const ausente = (campo: string) => {
    if (!x.campos_ausentes.includes(campo)) x.campos_ausentes.push(campo);
  };

  if (!trechoPresente(x.trecho_evidencia, textoFonte)) {
    return { aceito: false, candidato: x, avisos, motivoDescarte: "Trecho de evidência não localizado literalmente na fonte." };
  }
  if (x.unidade_responsavel && !aparece(x.unidade_responsavel, textoFonte)) {
    avisos.push(`Unidade responsável "${x.unidade_responsavel}" não aparece na fonte; campo anulado.`);
    x.unidade_responsavel = null;
    ausente("unidade_responsavel");
  }
  if (x.periodo) {
    const anos = x.periodo.match(/\b(19|20)\d{2}\b/g) ?? [];
    if (anos.some((a) => !textoFonte.includes(a))) {
      avisos.push(`Período "${x.periodo}" contém ano ausente da fonte; campo anulado.`);
      x.periodo = null;
      ausente("periodo");
    }
  }
  if (x.documento_relacionado) {
    const d = x.documento_relacionado;
    if (d.numero_documento && !aparece(d.numero_documento, textoFonte)) {
      avisos.push(`Número de documento "${d.numero_documento}" não aparece na fonte; anulado.`);
      d.numero_documento = null;
    }
    if (d.data_publicacao && !textoFonte.includes(d.data_publicacao.slice(0, 4))) {
      avisos.push("Data do documento relacionado sem ano correspondente na fonte; anulada.");
      d.data_publicacao = null;
    }
    if (!aparece(d.titulo, textoFonte) && !d.numero_documento) {
      avisos.push("Documento relacionado não identificável na fonte; removido.");
      x.documento_relacionado = null;
    }
  }
  if (!ehDominioOficial) {
    if (x.tipo_fonte !== "fonte_secundaria" && x.tipo_fonte !== "publicacao_cientifica") {
      avisos.push("Fonte fora do domínio institucional: classificada como secundária.");
      x.tipo_fonte = "fonte_secundaria";
    }
    if (x.grau_evidencia_sugerido < 3) {
      avisos.push("Fonte secundária não sustenta Nível 1/2; grau ajustado para 3 até haver evidência primária.");
      x.grau_evidencia_sugerido = 3;
    }
  }
  if (x.grau_evidencia_sugerido === 1 && !x.documento_relacionado) {
    avisos.push("Nível 1 exige documento normativo identificado; grau ajustado para 2.");
    x.grau_evidencia_sugerido = 2;
  }
  x.categorias_secundarias = x.categorias_secundarias.filter((s) => s !== x.categoria_sugerida);
  x.necessita_revisao_humana = true;
  return { aceito: true, candidato: x, avisos };
}
