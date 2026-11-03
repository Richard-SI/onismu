export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"] as const;
export type Regiao = (typeof REGIOES)[number];

/** Unidades da Federação e respectivas regiões (IBGE). */
export const UFS: Record<string, { nome: string; regiao: Regiao }> = {
  AC: { nome: "Acre", regiao: "Norte" }, AP: { nome: "Amapá", regiao: "Norte" }, AM: { nome: "Amazonas", regiao: "Norte" },
  PA: { nome: "Pará", regiao: "Norte" }, RO: { nome: "Rondônia", regiao: "Norte" }, RR: { nome: "Roraima", regiao: "Norte" },
  TO: { nome: "Tocantins", regiao: "Norte" },
  AL: { nome: "Alagoas", regiao: "Nordeste" }, BA: { nome: "Bahia", regiao: "Nordeste" }, CE: { nome: "Ceará", regiao: "Nordeste" },
  MA: { nome: "Maranhão", regiao: "Nordeste" }, PB: { nome: "Paraíba", regiao: "Nordeste" }, PE: { nome: "Pernambuco", regiao: "Nordeste" },
  PI: { nome: "Piauí", regiao: "Nordeste" }, RN: { nome: "Rio Grande do Norte", regiao: "Nordeste" }, SE: { nome: "Sergipe", regiao: "Nordeste" },
  DF: { nome: "Distrito Federal", regiao: "Centro-Oeste" }, GO: { nome: "Goiás", regiao: "Centro-Oeste" },
  MT: { nome: "Mato Grosso", regiao: "Centro-Oeste" }, MS: { nome: "Mato Grosso do Sul", regiao: "Centro-Oeste" },
  ES: { nome: "Espírito Santo", regiao: "Sudeste" }, MG: { nome: "Minas Gerais", regiao: "Sudeste" },
  RJ: { nome: "Rio de Janeiro", regiao: "Sudeste" }, SP: { nome: "São Paulo", regiao: "Sudeste" },
  PR: { nome: "Paraná", regiao: "Sul" }, RS: { nome: "Rio Grande do Sul", regiao: "Sul" }, SC: { nome: "Santa Catarina", regiao: "Sul" },
};

export const regiaoDaUf = (uf: string): Regiao => {
  const r = UFS[uf.toUpperCase()];
  if (!r) throw new Error(`UF desconhecida: ${uf}`);
  return r.regiao;
};
