import { normalizarTexto, truncar } from "../lib/texto.js";
import type { CandidatoExtraido, ContextoExtracao, Extrator, RespostaExtracao } from "./esquema.js";

/** Termos que indicam conteúdo potencialmente relevante (pré-filtro determinístico). */
export const TERMOS_RELEVANCIA = [
  "saude mental", "psicolog", "psicossocial", "acolhimento", "sofrimento psiquico", "suicidio",
  "bem-estar emocional", "bem estar emocional", "apoio psicopedagogico", "psiquiatr", "setembro amarelo",
  "ansiedade", "depressao",
];

export function paginaRelevante(texto: string): boolean {
  const t = normalizarTexto(texto);
  const fortes = ["saude mental", "psicossocial", "sofrimento psiquico", "psicolog", "suicidio", "setembro amarelo", "psiquiatr"];
  return fortes.some((k) => t.includes(k));
}

const REGRAS_CATEGORIA: { categoria: CandidatoExtraido["categoria_sugerida"]; padroes: RegExp[] }[] = [
  { categoria: "politica_institucional", padroes: [/\bpolitica (institucional )?de saude mental\b/, /\bresolucao\b.*saude mental/, /\bportaria\b.*saude mental/, /\bplano institucional\b/] },
  { categoria: "projeto_extensao", padroes: [/\bprojeto de extensao\b/, /\bacao de extensao\b/, /\bprograma de extensao\b/] },
  { categoria: "servico_permanente", padroes: [/\b(servico|nucleo|setor|centro) de (atendimento|apoio|atencao|psicologia)/, /\batendimento psicologico\b/, /\bclinica[- ]escola\b/, /\bplantao psicologico\b/] },
  { categoria: "acao_pontual", padroes: [/\bsetembro amarelo\b/, /\bpalestra\b/, /\bsemana (da|de) saude mental\b/, /\bcampanha\b/, /\bevento\b/] },
  { categoria: "pesquisa_formacao", padroes: [/\bcapacitacao\b/, /\bgrupo de pesquisa\b/, /\bformacao (de|em)\b/, /\bcurso de\b/] },
];

function frases(texto: string): string[] {
  return texto.split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 40 && s.length <= 600);
}

/**
 * Extrator sem IA: gera no máximo um candidato por página relevante, com categoria por regras e
 * trecho literal da própria página. Confiança sempre baixa — exige revisão humana completa.
 */
export class ExtratorHeuristico implements Extrator {
  nome = "heuristico";
  async extrair(ctx: ContextoExtracao): Promise<RespostaExtracao> {
    if (!paginaRelevante(ctx.texto)) return { pagina_relevante: false, iniciativas: [], observacoes: "Sem termos de saúde mental." };
    const norm = normalizarTexto(`${ctx.titulo ?? ""} ${ctx.texto}`);
    const pontuacao = REGRAS_CATEGORIA.map((r) => ({ c: r.categoria, n: r.padroes.filter((p) => p.test(norm)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    const categoria = pontuacao[0]?.c ?? "servico_permanente";
    const titulo = normalizarTexto(ctx.titulo ?? "");
    const candidatas = frases(ctx.texto).filter((f) => paginaRelevante(f) && !titulo.includes(normalizarTexto(f)));
    // Prefere frases descritivas (mais longas) a títulos e rótulos de menu.
    const trecho = candidatas.find((f) => f.length >= 80) ?? candidatas[0];
    if (!trecho) return { pagina_relevante: true, iniciativas: [], observacoes: "Termos presentes, mas sem frase descritiva utilizável." };
    const nome = truncar((ctx.titulo ?? trecho).replace(/\s*[|–-]\s*[^|–-]+$/, "").trim(), 200);
    return {
      pagina_relevante: true,
      observacoes: "Extração heurística (sem IA): categoria por palavras-chave; demais campos não extraídos.",
      iniciativas: [{
        nome: nome.length >= 3 ? nome : "Iniciativa sem título identificado",
        universidade_sugerida: ctx.universidade.nome_oficial,
        categoria_sugerida: categoria,
        categorias_secundarias: pontuacao.slice(1, 3).map((x) => x.c),
        descricao: candidatas.slice(0, 3).join(" "),
        objetivos: null,
        publico_alvo: [],
        modalidade: null,
        abrangencia: null,
        situacao_aparente: "desconhecida",
        periodo: null,
        unidade_responsavel: null,
        documento_relacionado: null,
        tipo_fonte: ctx.ehDominioOficial ? "site_institucional" : "fonte_secundaria",
        trecho_evidencia: trecho,
        grau_evidencia_sugerido: 4,
        confianca: "baixa",
        campos_ausentes: ["objetivos", "publico_alvo", "modalidade", "abrangencia", "periodo", "unidade_responsavel"],
        justificativa: `Categoria atribuída por regras de palavras-chave (${pontuacao.map((p) => `${p.c}:${p.n}`).join(", ") || "padrão"}). Requer revisão humana integral.`,
        necessita_revisao_humana: true,
      }],
    };
  }
}
