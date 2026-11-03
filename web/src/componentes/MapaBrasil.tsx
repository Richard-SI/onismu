import { geoMercator, geoPath } from "d3-geo";
import { useEffect, useMemo, useState } from "react";
import { fmtNum } from "../rotulos";

interface Feature { type: "Feature"; properties: { sigla: string; nome: string; regiao: string }; geometry: any }

const LARGURA = 600;
const ALTURA = 600;
const PASSOS = ["var(--seq-0)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)", "var(--seq-7)"];

/** Faixas inteiras para a escala sequencial (zero sempre na faixa mais clara). */
function faixas(max: number): number[] {
  if (max <= 0) return [0];
  const n = Math.min(6, max);
  const limites = new Set<number>();
  for (let i = 1; i <= n; i++) limites.add(Math.ceil((max * i) / n));
  return [0, ...[...limites].sort((a, b) => a - b)];
}

export function MapaBrasil({ valores, rotuloMetrica, selecionadas, aoSelecionar }: {
  valores: Record<string, number>; rotuloMetrica: string; selecionadas: string[]; aoSelecionar: (uf: string) => void;
}) {
  const [geo, setGeo] = useState<{ features: Feature[] } | null>(null);
  const [erro, setErro] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  useEffect(() => {
    fetch("/br_uf.geojson").then((r) => r.json()).then(setGeo).catch(() => setErro(true));
  }, []);

  const caminho = useMemo(() => {
    if (!geo) return null;
    const proj = geoMercator().fitSize([LARGURA, ALTURA], geo as any);
    return geoPath(proj);
  }, [geo]);

  const max = Math.max(0, ...Object.values(valores));
  const lim = faixas(max);
  const corDe = (v: number) => {
    if (v <= 0) return PASSOS[0];
    const i = lim.findIndex((l) => v <= l);
    return PASSOS[Math.max(1, Math.min(PASSOS.length - 1, i === -1 ? lim.length - 1 : i + 1))];
  };

  if (erro) return <div className="erro">Não foi possível carregar a malha geográfica. Use a tabela abaixo.</div>;
  if (!geo || !caminho) return <p className="discreto">Carregando mapa…</p>;
  const ativo = foco ? geo.features.find((f) => f.properties.sigla === foco) : null;

  return (
    <div className="mapa">
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="group" aria-label={`Mapa do Brasil por unidade da federação — ${rotuloMetrica}. Selecione um estado para filtrar.`}>
        {geo.features.map((f) => {
          const uf = f.properties.sigla;
          const v = valores[uf] ?? 0;
          return (
            <path key={uf} d={caminho(f as any) ?? ""} className={`uf ${selecionadas.includes(uf) ? "selecionada" : ""}`}
              fill={corDe(v)} tabIndex={0} role="button" aria-pressed={selecionadas.includes(uf)}
              aria-label={`${f.properties.nome}: ${fmtNum(v)} — ${rotuloMetrica}`}
              onClick={() => aoSelecionar(uf)} onMouseEnter={() => setFoco(uf)} onMouseLeave={() => setFoco(null)}
              onFocus={() => setFoco(uf)} onBlur={() => setFoco(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoSelecionar(uf); } }} />
          );
        })}
      </svg>
      <div className="linha entre" style={{ minHeight: 28 }}>
        <div className="escala" aria-label="Escala de cores">
          <span>{rotuloMetrica}:</span>
          <span className="caixa" style={{ background: PASSOS[0], border: "1px solid var(--borda)" }} /> 0
          {lim.slice(1).map((l, i) => (
            <span key={l} className="linha" style={{ gap: 4 }}>
              <span className="caixa" style={{ background: PASSOS[Math.min(PASSOS.length - 1, i + 2)] }} />
              {(() => { const de = i === 0 ? 1 : lim[i] + 1; return de === l ? `${l}` : `${de}–${l}`; })()}
            </span>
          ))}
        </div>
        <span className="discreto num" aria-live="polite">{ativo ? `${ativo.properties.nome}: ${fmtNum(valores[ativo.properties.sigla] ?? 0)}` : ""}</span>
      </div>
    </div>
  );
}
