import { z } from "zod";

export const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(20),
});

export type Paginacao = z.infer<typeof esquemaPaginacao>;

export const offsetDe = (p: Paginacao) => (p.pagina - 1) * p.por_pagina;

export const respostaPaginada = <T>(itens: T[], total: number, p: Paginacao) => ({
  itens,
  total,
  pagina: p.pagina,
  por_pagina: p.por_pagina,
  total_paginas: Math.max(1, Math.ceil(total / p.por_pagina)),
});

/** Constrói cláusulas WHERE parametrizadas sem concatenar valores do usuário. */
export class Filtros {
  clausulas: string[] = [];
  params: unknown[] = [];
  add(sqlComPlaceholder: (n: string) => string, valor: unknown) {
    this.params.push(valor);
    this.clausulas.push(sqlComPlaceholder(`$${this.params.length}`));
    return this;
  }
  addLiteral(sql: string) {
    this.clausulas.push(sql);
    return this;
  }
  /** Reserva um parâmetro e devolve o placeholder. */
  param(valor: unknown): string {
    this.params.push(valor);
    return `$${this.params.length}`;
  }
  get where() {
    return this.clausulas.length ? "WHERE " + this.clausulas.join(" AND ") : "";
  }
}

/** Aceita "1,2,3" ou ["1","2"] em query strings. */
export const listaQuery = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (v) => (v === undefined || v === null ? [] : (Array.isArray(v) ? v : String(v).split(",")).map((s) => String(s).trim()).filter(Boolean)),
    z.array(item),
  );
