import ExcelJS from "exceljs";

export interface Coluna<T> {
  chave: string;
  titulo: string;
  valor: (linha: T) => unknown;
}

/**
 * Proteção contra CSV/fórmula injection: células iniciadas por = + - @ TAB ou CR
 * são prefixadas com apóstrofo, para que planilhas não as interpretem como fórmulas.
 */
export function celulaSegura(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s =
    Array.isArray(v) ? v.map((x) => (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x))).join("; ")
    : v instanceof Date ? v.toISOString()
    : typeof v === "object" ? JSON.stringify(v)
    : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

const escaparCsv = (s: string) => (/[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function gerarCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const cab = colunas.map((c) => escaparCsv(c.titulo)).join(",");
  const corpo = linhas.map((l) => colunas.map((c) => escaparCsv(celulaSegura(c.valor(l)))).join(","));
  // BOM UTF-8 para abertura correta no Excel.
  return "﻿" + [cab, ...corpo].join("\r\n") + "\r\n";
}

export async function gerarXlsx(
  abas: { nome: string; linhas: any[]; colunas: Coluna<any>[] }[],
  metadados: Record<string, string>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ONISMU";
  wb.created = new Date();
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome.slice(0, 31));
    ws.columns = aba.colunas.map((c) => ({ header: c.titulo, key: c.chave, width: Math.min(60, Math.max(12, c.titulo.length + 4)) }));
    ws.getRow(1).font = { bold: true };
    for (const l of aba.linhas) {
      const obj: Record<string, string> = {};
      for (const c of aba.colunas) obj[c.chave] = celulaSegura(c.valor(l));
      ws.addRow(obj);
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  const meta = wb.addWorksheet("Sobre");
  meta.columns = [{ header: "Campo", key: "k", width: 30 }, { header: "Valor", key: "v", width: 100 }];
  for (const [k, v] of Object.entries(metadados)) meta.addRow({ k, v: celulaSegura(v) });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
