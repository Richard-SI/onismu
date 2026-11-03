/** Leitor CSV (RFC 4180): aspas, vírgulas e quebras de linha dentro de campos. */
export function lerCsv(texto: string, separador = ","): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === separador) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((c) => c !== "")) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo !== "" || linha.length) { linha.push(campo); if (linha.some((c) => c !== "")) linhas.push(linha); }
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c.trim(), (l[i] ?? "").trim()])));
}
