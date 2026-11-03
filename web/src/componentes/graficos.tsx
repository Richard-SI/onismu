import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtNum, fmtPct } from "../rotulos";

interface Serie { chave: string; nome: string; cor: string }

function Cabecalho({ titulo, subtitulo, verTabela, setVerTabela }: { titulo: string; subtitulo?: ReactNode; verTabela: boolean; setVerTabela: (v: boolean) => void }) {
  return (
    <div className="grafico-cab">
      <div>
        <h3>{titulo}</h3>
        {subtitulo && <div className="muito-discreto">{subtitulo}</div>}
      </div>
      <button type="button" className="botao botao-sec botao-peq nao-imprimir" aria-pressed={verTabela} onClick={() => setVerTabela(!verTabela)}>
        {verTabela ? "Ver gráfico" : "Ver tabela"}
      </button>
    </div>
  );
}

function Dica({ active, payload, label, total }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dica">
      <strong>{label}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="num">
          {payload.length > 1 && <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: p.color, marginRight: 6 }} />}
          {payload.length > 1 ? `${p.name}: ` : ""}{fmtNum(p.value)}{total ? ` (${fmtPct((p.value / total) * 100)})` : ""}
        </div>
      ))}
    </div>
  );
}

/** Barras horizontais de série única (uma cor), com rótulo de valor na ponta e tabela equivalente. */
export function BarrasHorizontais({ titulo, subtitulo, dados, rotuloValor = "Quantidade", total, cor = "var(--serie-1)" }: {
  titulo: string; subtitulo?: ReactNode; dados: { rotulo: string; valor: number }[]; rotuloValor?: string; total?: number; cor?: string;
}) {
  const [verTabela, setVerTabela] = useState(false);
  const altura = Math.max(120, dados.length * 38 + 40);
  return (
    <figure className="grafico" style={{ margin: 0 }}>
      <Cabecalho titulo={titulo} subtitulo={subtitulo} verTabela={verTabela} setVerTabela={setVerTabela} />
      {verTabela ? (
        <TabelaSimples cabecalhos={["Item", rotuloValor, ...(total ? ["%"] : [])]}
          linhas={dados.map((d) => [d.rotulo, fmtNum(d.valor), ...(total ? [fmtPct((d.valor / total) * 100)] : [])])} />
      ) : (
        <div style={{ width: "100%", height: altura }} role="img" aria-label={`${titulo}: ${dados.map((d) => `${d.rotulo} ${d.valor}`).join("; ")}`}>
          <ResponsiveContainer>
            <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }} barCategoryGap={10}>
              <CartesianGrid horizontal={false} stroke="var(--grade)" />
              <XAxis type="number" allowDecimals={false} stroke="var(--eixo)" tickLine={false} />
              <YAxis type="category" dataKey="rotulo" width={190} stroke="var(--eixo)" tickLine={false} interval={0} />
              <Tooltip content={<Dica total={total} />} cursor={{ fill: "var(--superficie-2)" }} />
              <Bar dataKey="valor" name={rotuloValor} fill={cor} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                <LabelList dataKey="valor" position="right" style={{ fill: "var(--tinta)", fontSize: 12 }} formatter={(v: any) => fmtNum(Number(v))} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Barras horizontais empilhadas: séries com cor fixa por entidade, separadas por fresta da superfície. */
export function BarrasEmpilhadas({ titulo, subtitulo, linhas, series }: {
  titulo: string; subtitulo?: ReactNode; linhas: ({ rotulo: string } & Record<string, number | string>)[]; series: Serie[];
}) {
  const [verTabela, setVerTabela] = useState(false);
  const altura = Math.max(140, linhas.length * 44 + 50);
  return (
    <figure className="grafico" style={{ margin: 0 }}>
      <Cabecalho titulo={titulo} subtitulo={subtitulo} verTabela={verTabela} setVerTabela={setVerTabela} />
      <ul className="legenda" aria-label="Legenda">
        {series.map((s) => <li key={s.chave}><span className="amostra" style={{ background: s.cor }} />{s.nome}</li>)}
      </ul>
      {verTabela ? (
        <TabelaSimples cabecalhos={["", ...series.map((s) => s.nome), "Total"]}
          linhas={linhas.map((l) => [l.rotulo, ...series.map((s) => fmtNum(Number(l[s.chave] ?? 0))), fmtNum(series.reduce((t, s) => t + Number(l[s.chave] ?? 0), 0))])} />
      ) : (
        <div style={{ width: "100%", height: altura }} role="img" aria-label={`${titulo}. Use "Ver tabela" para os valores.`}>
          <ResponsiveContainer>
            <BarChart data={linhas} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={12}>
              <CartesianGrid horizontal={false} stroke="var(--grade)" />
              <XAxis type="number" allowDecimals={false} stroke="var(--eixo)" tickLine={false} />
              <YAxis type="category" dataKey="rotulo" width={150} stroke="var(--eixo)" tickLine={false} interval={0} />
              <Tooltip content={<Dica />} cursor={{ fill: "var(--superficie-2)" }} />
              {series.map((s, i) => (
                <Bar key={s.chave} dataKey={s.chave} name={s.nome} stackId="a" fill={s.cor} stroke="var(--superficie)" strokeWidth={2}
                  barSize={18} isAnimationActive={false} radius={i === series.length - 1 ? [0, 4, 4, 0] : 0} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

export function TabelaSimples({ cabecalhos, linhas, legenda }: { cabecalhos: string[]; linhas: ReactNode[][]; legenda?: string }) {
  return (
    <div className="tabela-rolagem">
      <table>
        {legenda && <caption>{legenda}</caption>}
        <thead><tr>{cabecalhos.map((c, i) => <th key={i} className={i > 0 ? "num" : undefined}>{c}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className={j > 0 ? "num" : undefined}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
