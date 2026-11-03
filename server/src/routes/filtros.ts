import { z } from "zod";
import {
  CATEGORIAS_ADMINISTRATIVAS, SITUACOES_DOCUMENTADAS, SITUACOES_PESQUISA, STATUS_VALIDACAO,
} from "../dominio.js";
import { REGIOES, UFS } from "../lib/geografia.js";
import { esquemaPaginacao, listaQuery } from "../lib/paginacao.js";

const bool = z
  .enum(["true", "false", "1", "0", "sim", "nao"])
  .optional()
  .transform((v) => (v === undefined ? undefined : ["true", "1", "sim"].includes(v)));

export const esquemaFiltrosUniverso = z.object({
  regiao: listaQuery(z.enum(REGIOES)),
  estado: listaQuery(z.string().toUpperCase().refine((v) => v in UFS, "UF inválida")),
  categoria_administrativa: listaQuery(z.enum(CATEGORIAS_ADMINISTRATIVAS)),
  demo: bool,
});

export const esquemaFiltrosIniciativas = esquemaFiltrosUniverso.extend({
  q: z.string().trim().max(200).optional(),
  universidade_id: listaQuery(z.coerce.number().int().positive()),
  categoria: listaQuery(z.string().regex(/^[a-z_]+$/)),
  incluir_secundarias: bool,
  publico: listaQuery(z.string().regex(/^[a-z_]+$/)),
  situacao_documentada: listaQuery(z.enum(SITUACOES_DOCUMENTADAS)),
  grau_evidencia: listaQuery(z.coerce.number().int().min(1).max(4)),
  tem_documento_normativo: bool,
  status_validacao: listaQuery(z.enum(STATUS_VALIDACAO)),
  ordenar: z.enum(["nome", "universidade", "recentes", "grau"]).optional(),
}).merge(esquemaPaginacao);

export const esquemaFiltrosUniversidades = esquemaFiltrosUniverso.extend({
  q: z.string().trim().max(200).optional(),
  situacao_pesquisa: listaQuery(z.enum(SITUACOES_PESQUISA)),
  ordenar: z.enum(["nome", "estado", "iniciativas", "verificacao"]).optional(),
}).merge(esquemaPaginacao);
