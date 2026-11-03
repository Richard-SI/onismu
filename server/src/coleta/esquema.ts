import { z } from "zod";
import { TIPOS_FONTE } from "../dominio.js";

export const CODIGOS_CATEGORIA = [
  "politica_institucional", "projeto_extensao", "servico_permanente", "acao_pontual", "pesquisa_formacao",
] as const;

/**
 * Schema da extração estruturada. É usado (1) como formato de saída exigido do modelo e
 * (2) para validar a resposta antes de qualquer gravação. Campos desconhecidos usam null.
 */
export const esquemaCandidatoExtraido = z.object({
  nome: z.string().min(3).max(300),
  universidade_sugerida: z.string().max(300).nullable(),
  categoria_sugerida: z.enum(CODIGOS_CATEGORIA),
  categorias_secundarias: z.array(z.enum(CODIGOS_CATEGORIA)).max(4),
  descricao: z.string().max(3000).nullable(),
  objetivos: z.string().max(2000).nullable(),
  publico_alvo: z.array(z.string().max(60)).max(10),
  modalidade: z.enum(["presencial", "online", "hibrida"]).nullable(),
  abrangencia: z.enum(["institucional", "campus", "unidade", "externa"]).nullable(),
  situacao_aparente: z.enum(["ativa", "encerrada", "desconhecida"]),
  periodo: z.string().max(200).nullable(),
  unidade_responsavel: z.string().max(300).nullable(),
  documento_relacionado: z
    .object({
      titulo: z.string().max(500),
      tipo_documento: z.string().max(40),
      numero_documento: z.string().max(100).nullable(),
      data_publicacao: z.string().max(10).nullable(),
      orgao_emissor: z.string().max(300).nullable(),
    })
    .nullable(),
  tipo_fonte: z.enum(TIPOS_FONTE),
  trecho_evidencia: z.string().min(15).max(1200),
  grau_evidencia_sugerido: z.number().int().min(1).max(4),
  confianca: z.enum(["alta", "media", "baixa"]),
  campos_ausentes: z.array(z.string().max(60)).max(20),
  justificativa: z.string().max(1500),
  necessita_revisao_humana: z.boolean(),
});

export const esquemaRespostaExtracao = z.object({
  pagina_relevante: z.boolean(),
  iniciativas: z.array(esquemaCandidatoExtraido).max(15),
  observacoes: z.string().max(2000).nullable(),
});

export type CandidatoExtraido = z.infer<typeof esquemaCandidatoExtraido>;
export type RespostaExtracao = z.infer<typeof esquemaRespostaExtracao>;

export interface ContextoExtracao {
  universidade: { nome_oficial: string; sigla: string | null; dominio: string | null };
  url: string;
  titulo: string | null;
  texto: string;
  ehDominioOficial: boolean;
}

export interface Extrator {
  nome: string;
  extrair(ctx: ContextoExtracao): Promise<RespostaExtracao>;
}
