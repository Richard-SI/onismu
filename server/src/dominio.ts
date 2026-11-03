import { z } from "zod";

export const CATEGORIAS_ADMINISTRATIVAS = [
  "publica_federal", "publica_estadual", "publica_municipal",
  "privada_sem_fins_lucrativos", "privada_com_fins_lucrativos", "especial",
] as const;

export const SITUACOES_PESQUISA = [
  "nao_pesquisada", "em_pesquisa", "concluida_com_iniciativas",
  "concluida_sem_iniciativas", "inconclusiva", "aguardando_validacao",
] as const;
export const SITUACOES_CONCLUIDAS = ["concluida_com_iniciativas", "concluida_sem_iniciativas"] as const;

export const STATUS_VALIDACAO = ["pendente", "validada", "rejeitada", "inconclusiva", "arquivada"] as const;
export const SITUACOES_DOCUMENTADAS = ["ativa", "encerrada", "desconhecida"] as const;
export const MODALIDADES = ["presencial", "online", "hibrida"] as const;
export const ABRANGENCIAS = ["institucional", "campus", "unidade", "externa"] as const;
export const PERIODICIDADES = ["permanente", "periodica", "pontual", "desconhecida"] as const;
export const TIPOS_FONTE = [
  "site_institucional", "documento_normativo", "noticia_oficial", "sistema_extensao",
  "relatorio_institucional", "repositorio", "publicacao_cientifica", "fonte_secundaria",
] as const;
export const TIPOS_DOCUMENTO = [
  "resolucao", "portaria", "instrucao_normativa", "plano", "politica", "relatorio", "edital", "regimento", "outro",
] as const;
/** Tipos de documento que caracterizam formalização normativa (exigidos para o Nível 1). */
export const TIPOS_DOCUMENTO_NORMATIVO = ["resolucao", "portaria", "instrucao_normativa", "politica", "regimento", "plano"] as const;
export const TIPOS_RELACAO = ["vinculada_a_politica", "parte_de", "relacionada", "duplicata_de"] as const;
export const STATUS_CANDIDATO = ["pendente", "aprovado", "rejeitado", "inconclusivo", "recoleta_solicitada", "vinculado"] as const;

export const GRAUS_EVIDENCIA = {
  1: "Política formalizada",
  2: "Programa institucional estruturado",
  3: "Serviço ou ação institucional",
  4: "Evidência insuficiente",
} as const;

/** Meses após os quais a evidência mais recente é considerada desatualizada. */
export const MESES_ATUALIDADE = 24;

const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const dataOpcional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
  .optional()
  .nullable()
  .transform((v) => v ?? null);

export const esquemaEvidenciaEntrada = z.object({
  url: z.string().trim().min(8).max(2000),
  titulo: textoOpcional(500),
  tipo_fonte: z.enum(TIPOS_FONTE),
  trecho_evidencia: z.string().trim().min(10).max(4000),
  data_consulta: z.string().datetime({ offset: true }).optional().nullable(),
  data_publicacao: dataOpcional,
});

export const esquemaIniciativaEntrada = z
  .object({
    nome: z.string().trim().min(3).max(300),
    descricao: textoOpcional(8000),
    objetivos: textoOpcional(4000),
    universidade_id: z.number().int().positive(),
    campus_id: z.number().int().positive().optional().nullable().transform((v) => v ?? null),
    unidade_responsavel: textoOpcional(300),
    categoria_principal: z.string().min(2),
    categorias_secundarias: z.array(z.string()).max(4).default([]),
    publicos: z.array(z.string()).max(10).default([]),
    modalidade: z.enum(MODALIDADES).optional().nullable().transform((v) => v ?? null),
    abrangencia: z.enum(ABRANGENCIAS).optional().nullable().transform((v) => v ?? null),
    data_inicio: dataOpcional,
    data_fim: dataOpcional,
    situacao_documentada: z.enum(SITUACOES_DOCUMENTADAS).default("desconhecida"),
    periodicidade: z.enum(PERIODICIDADES).optional().nullable().transform((v) => v ?? null),
    grau_evidencia: z.number().int().min(1).max(4).default(4),
    status_validacao: z.enum(STATUS_VALIDACAO).default("pendente"),
    limitacoes: textoOpcional(4000),
    data_ultima_evidencia: dataOpcional,
    documentos_ids: z.array(z.number().int().positive()).max(50).default([]),
    evidencias: z.array(esquemaEvidenciaEntrada).max(20).default([]),
    justificativa: textoOpcional(1000),
  })
  .refine((d) => !d.categorias_secundarias.includes(d.categoria_principal), {
    message: "A categoria principal não pode ser repetida como secundária.",
    path: ["categorias_secundarias"],
  })
  .refine((d) => !d.data_inicio || !d.data_fim || d.data_fim >= d.data_inicio, {
    message: "A data de término é anterior à de início.",
    path: ["data_fim"],
  });

export type IniciativaEntrada = z.infer<typeof esquemaIniciativaEntrada>;
