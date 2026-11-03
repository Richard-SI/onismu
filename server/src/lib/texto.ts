/** Remove acentos, normaliza espaços e caixa — para comparações determinísticas. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’“”«»"'`´]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** O trecho aparece (após normalização) no texto da fonte? */
export function trechoPresente(trecho: string, textoFonte: string): boolean {
  const t = normalizarTexto(trecho).replace(/[.…]+$/, "").replace(/^[.…]+/, "").trim();
  if (t.length < 15) return false;
  const fonte = normalizarTexto(textoFonte);
  if (fonte.includes(t)) return true;
  // Tolera reticências usadas para encurtar o trecho: cada parte deve estar presente.
  const partes = t.split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).filter((p) => p.length >= 15);
  return partes.length > 1 && partes.every((p) => fonte.includes(p));
}

export function gerarSlug(s: string): string {
  return normalizarTexto(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "iniciativa";
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "para", "na", "no", "à"]);

/** Converte "UNIVERSIDADE FEDERAL DO RIO GRANDE" em "Universidade Federal do Rio Grande". */
export function capitalizarNome(nome: string): string {
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|-|\/|\()/)
    .map((p, i) => {
      if (!p.trim() || /^[-/(]$/.test(p)) return p;
      if (i > 0 && MINUSCULAS.has(p)) return p;
      if (/^(i{1,3}|iv|vi{0,3}|ix|x)$/i.test(p)) return p.toUpperCase(); // algarismos romanos
      return p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1);
    })
    .join("");
}

export function truncar(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
