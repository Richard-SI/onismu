import { useState } from "react";
import { Link } from "react-router-dom";
import { qs, useApi } from "../api";
import { AvisoCobertura, Estado, useTitulo } from "../componentes/base";
import { MapaBrasil } from "../componentes/MapaBrasil";
import { useDemo } from "../contexto";
import { CATEGORIAS, REGIOES, UFS, fmtNum } from "../rotulos";

const METRICAS: Record<string, string> = {
  iniciativas_validadas: "Iniciativas validadas",
  universidades: "Universidades no universo",
  concluidas: "Universidades com pesquisa concluída",
  universidades_com_iniciativas: "Universidades com iniciativas validadas",
  nao_pesquisadas: "Universidades ainda não pesquisadas",
  ...Object.fromEntries(Object.entries(CATEGORIAS).map(([k, v]) => [k, `Iniciativas: ${v}`])),
};

export function Mapa() {
  useTitulo("Mapa");
  const demo = useDemo();
  const [metrica, setMetrica] = useState("iniciativas_validadas");
  const [regiao, setRegiao] = useState("");
  const [ufs, setUfs] = useState<string[]>([]);
  const { dados, erro } = useApi<any[]>(`/api/publico/mapa${qs({ demo })}`);
  const linhas = (dados ?? []).filter((r) => !regiao || r.regiao === regiao);
  const valores = Object.fromEntries(linhas.map((r) => [r.estado, Number(r[metrica] ?? 0)]));
  const universo = (dados ?? []).reduce((s, r) => s + r.universidades, 0);
  const concluidas = (dados ?? []).reduce((s, r) => s + r.concluidas, 0);
  const alternar = (uf: string) => setUfs((a) => (a.includes(uf) ? a.filter((x) => x !== uf) : [...a, uf]));

  return (
    <div className="pilha">
      <h1>Mapa interativo</h1>
      <p className="discreto">Selecione estados no mapa (clique ou Enter) para abrir os registros relacionados. A intensidade da cor indica <strong>quantidade de registros</strong> —
        nunca qualidade dos serviços — e deve ser lida com a cobertura da pesquisa em cada estado.</p>
      <AvisoCobertura concluidas={concluidas} universo={universo} />
      <div className="cartao campos nao-imprimir">
        <div>
          <label htmlFor="m-metrica">Medida exibida</label>
          <select id="m-metrica" value={metrica} onChange={(e) => setMetrica(e.target.value)}>
            {Object.entries(METRICAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="m-regiao">Região</label>
          <select id="m-regiao" value={regiao} onChange={(e) => { setRegiao(e.target.value); setUfs([]); }}>
            <option value="">Brasil</option>
            {REGIOES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="linha">
          {ufs.length > 0 && (
            <>
              <Link className="botao" to={`/iniciativas?estado=${ufs.join(",")}`}>Ver iniciativas ({ufs.join(", ")})</Link>
              <Link className="botao botao-sec" to={`/universidades?estado=${ufs.join(",")}`}>Ver universidades</Link>
              <button className="botao botao-sec" onClick={() => setUfs([])}>Limpar</button>
            </>
          )}
        </div>
      </div>
      <Estado erro={erro} carregando={!dados}>
        <div className="grade grade-2">
          <div className="grafico"><MapaBrasil valores={valores} rotuloMetrica={METRICAS[metrica]} selecionadas={ufs} aoSelecionar={alternar} /></div>
          <div className="tabela-rolagem" style={{ maxHeight: 680, overflowY: "auto" }}>
            <table>
              <caption>Tabela equivalente ao mapa{regiao ? ` — ${regiao}` : ""}</caption>
              <thead>
                <tr><th>UF</th><th className="num">Universidades</th><th className="num">Concluídas</th><th className="num">Não pesquisadas</th><th className="num">Iniciativas validadas</th></tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <tr key={r.estado} style={ufs.includes(r.estado) ? { background: "var(--marca-suave)" } : undefined}>
                    <td><Link to={`/iniciativas?estado=${r.estado}`}>{UFS[r.estado]}</Link></td>
                    <td className="num">{fmtNum(r.universidades)}</td>
                    <td className="num">{fmtNum(r.concluidas)}</td>
                    <td className="num">{fmtNum(r.nao_pesquisadas)}</td>
                    <td className="num">{fmtNum(r.iniciativas_validadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Estado>
    </div>
  );
}
