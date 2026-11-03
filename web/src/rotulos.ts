export const CATEGORIAS: Record<string, string> = {
  politica_institucional: "Política institucional",
  projeto_extensao: "Projeto de extensão",
  servico_permanente: "Serviço permanente",
  acao_pontual: "Programa ou ação pontual",
  pesquisa_formacao: "Pesquisa, formação e capacitação",
};
export const ORDEM_CATEGORIAS = Object.keys(CATEGORIAS);

/** Cor categórica fixa por categoria (segue a entidade, nunca a posição). Paleta validada para daltonismo. */
export const COR_CATEGORIA: Record<string, string> = {
  politica_institucional: "var(--serie-1)",
  projeto_extensao: "var(--serie-2)",
  servico_permanente: "var(--serie-3)",
  acao_pontual: "var(--serie-4)",
  pesquisa_formacao: "var(--serie-5)",
};

export const SITUACOES_PESQUISA: Record<string, string> = {
  nao_pesquisada: "Não pesquisada",
  em_pesquisa: "Em pesquisa",
  aguardando_validacao: "Aguardando validação",
  concluida_com_iniciativas: "Concluída — com iniciativas identificadas",
  concluida_sem_iniciativas: "Concluída — sem iniciativas localizadas",
  inconclusiva: "Pesquisa inconclusiva",
};
export const SITUACOES_CURTAS: Record<string, string> = {
  nao_pesquisada: "Não pesquisada",
  em_pesquisa: "Em pesquisa",
  aguardando_validacao: "Aguardando validação",
  concluida_com_iniciativas: "Com iniciativas",
  concluida_sem_iniciativas: "Sem iniciativas localizadas",
  inconclusiva: "Inconclusiva",
};
export const ORDEM_SITUACOES = ["concluida_com_iniciativas", "concluida_sem_iniciativas", "inconclusiva", "aguardando_validacao", "em_pesquisa", "nao_pesquisada"];

export const CATEGORIAS_ADM: Record<string, string> = {
  publica_federal: "Pública federal",
  publica_estadual: "Pública estadual",
  publica_municipal: "Pública municipal",
  privada_sem_fins_lucrativos: "Privada sem fins lucrativos",
  privada_com_fins_lucrativos: "Privada com fins lucrativos",
  especial: "Especial (art. 242 CF)",
};

export const GRAUS: Record<number, string> = {
  1: "Nível 1 — Política formalizada",
  2: "Nível 2 — Programa institucional estruturado",
  3: "Nível 3 — Serviço ou ação institucional",
  4: "Nível 4 — Evidência insuficiente",
};

export const SITUACOES_DOC: Record<string, string> = { ativa: "Ativa (documentada)", encerrada: "Encerrada", desconhecida: "Situação atual desconhecida" };
export const ATUALIDADE: Record<string, string> = { recente: "Fonte recente", desatualizada: "Fonte com mais de 24 meses", desconhecida: "Data da fonte desconhecida" };
export const STATUS_VALIDACAO: Record<string, string> = { pendente: "Pendente", validada: "Validada", rejeitada: "Rejeitada", inconclusiva: "Inconclusiva", arquivada: "Arquivada" };
export const STATUS_CANDIDATO: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado", inconclusivo: "Inconclusivo",
  recoleta_solicitada: "Nova coleta solicitada", vinculado: "Vinculado a iniciativa",
};
export const VERIFICACAO: Record<string, string> = {
  confirmado: "Trecho confirmado na fonte", nao_localizado: "Trecho NÃO localizado na fonte",
  nao_verificado: "Trecho não verificado", erro_acesso: "Fonte inacessível na verificação",
};
export const TIPOS_FONTE: Record<string, string> = {
  site_institucional: "Site institucional", documento_normativo: "Documento normativo", noticia_oficial: "Notícia oficial",
  sistema_extensao: "Sistema de extensão", relatorio_institucional: "Relatório institucional", repositorio: "Repositório",
  publicacao_cientifica: "Publicação científica", fonte_secundaria: "Fonte secundária",
};
export const TIPOS_DOCUMENTO: Record<string, string> = {
  resolucao: "Resolução", portaria: "Portaria", instrucao_normativa: "Instrução normativa", plano: "Plano", politica: "Política",
  relatorio: "Relatório", edital: "Edital", regimento: "Regimento", outro: "Outro",
};
export const MODALIDADES: Record<string, string> = { presencial: "Presencial", online: "On-line", hibrida: "Híbrida" };
export const ABRANGENCIAS: Record<string, string> = { institucional: "Institucional", campus: "Campus", unidade: "Unidade", externa: "Comunidade externa" };
export const PUBLICOS: Record<string, string> = {
  estudantes: "Estudantes (geral)", estudantes_graduacao: "Graduação", pos_graduandos: "Pós-graduação", docentes: "Docentes",
  tecnicos_administrativos: "Técnicos-administrativos", servidores: "Servidores", comunidade_universitaria: "Comunidade universitária",
  comunidade_externa: "Comunidade externa", estudantes_assistencia: "Assistência estudantil", outros: "Outros",
};
export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
export const UFS: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba",
  PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export const rotulo = (mapa: Record<string, string>, v: string | null | undefined) => (v ? mapa[v] ?? v : "Não informado");
export const fmtData = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—");
export const fmtNum = (n?: number | null) => (n === null || n === undefined ? "—" : n.toLocaleString("pt-BR"));
export const fmtPct = (n?: number | null) => (n === null || n === undefined ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
