import { useSearchParams } from "react-router-dom";
import { CATEGORIAS_ADM, REGIOES, UFS } from "../rotulos";
import { Chips } from "./base";

export const lista = (sp: URLSearchParams, k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);

/** Filtros de recorte (região, UF, categoria administrativa) sincronizados com a URL — uma única linha acima dos gráficos. */
export function useFiltrosUniverso() {
  const [sp, setSp] = useSearchParams();
  const valores = { regiao: lista(sp, "regiao"), estado: lista(sp, "estado"), categoria_administrativa: lista(sp, "categoria_administrativa") };
  const definir = (k: string, v: string[]) => {
    const n = new URLSearchParams(sp);
    if (v.length) n.set(k, v.join(",")); else n.delete(k);
    n.delete("pagina");
    setSp(n, { replace: true });
  };
  const limpar = () => {
    const n = new URLSearchParams(sp);
    for (const k of ["regiao", "estado", "categoria_administrativa", "pagina"]) n.delete(k);
    setSp(n, { replace: true });
  };
  return { valores, definir, limpar, sp, setSp };
}

export function FiltrosUniverso({ valores, definir, limpar, mostrarUf = true }: ReturnType<typeof useFiltrosUniverso> & { mostrarUf?: boolean }) {
  const ativos = valores.regiao.length + valores.estado.length + valores.categoria_administrativa.length;
  return (
    <section className="cartao nao-imprimir" aria-label="Filtros">
      <div className="grade grade-3" style={{ alignItems: "start" }}>
        <div>
          <label id="f-regiao">Região</label>
          <Chips rotuloGrupo="Região" opcoes={Object.fromEntries(REGIOES.map((r) => [r, r]))} selecionados={valores.regiao} aoMudar={(v) => definir("regiao", v)} />
        </div>
        {mostrarUf && (
          <div>
            <label htmlFor="f-uf">Unidade da federação</label>
            <select id="f-uf" value={valores.estado[0] ?? ""} onChange={(e) => definir("estado", e.target.value ? [e.target.value] : [])}>
              <option value="">Todas</option>
              {Object.entries(UFS).map(([k, v]) => <option key={k} value={k}>{v} ({k})</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="f-cat">Categoria administrativa</label>
          <select id="f-cat" value={valores.categoria_administrativa[0] ?? ""} onChange={(e) => definir("categoria_administrativa", e.target.value ? [e.target.value] : [])}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIAS_ADM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {ativos > 0 && (
        <button type="button" className="botao botao-sec botao-peq" style={{ marginTop: 12 }}
          onClick={limpar}>Limpar filtros</button>
      )}
    </section>
  );
}
