import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ErroApi } from "../api";
import { COR_CATEGORIA, GRAUS, SITUACOES_CURTAS, VERIFICACAO, fmtNum, fmtPct, rotulo, CATEGORIAS } from "../rotulos";

export function useTitulo(t: string) {
  useEffect(() => { document.title = `${t} · ONISMU`; }, [t]);
}

export function Estado({ carregando, erro, vazio, children }: { carregando?: boolean; erro?: ErroApi | null; vazio?: boolean; children?: ReactNode }) {
  if (erro) return <div className="erro" role="alert"><strong>Não foi possível carregar os dados.</strong> {erro.message}</div>;
  if (carregando && !children) return <p className="discreto" role="status">Carregando…</p>;
  if (vazio) return <div className="vazio">Nenhum registro encontrado com os critérios selecionados.</div>;
  return <>{children}</>;
}

export function Indicador({ rotulo: r, valor, base, dica }: { rotulo: string; valor: ReactNode; base?: ReactNode; dica?: string }) {
  return (
    <div className="indicador" title={dica}>
      <span className="rotulo">{r}</span>
      <span className="valor">{valor}</span>
      {base && <span className="base">{base}</span>}
    </div>
  );
}

/** Indicador percentual que sempre exibe numerador, denominador e fórmula. */
export function IndicadorPct({ rotulo: r, ind }: { rotulo: string; ind: { valor: number | null; numerador: number; denominador: number; formula: string; rotulo_denominador: string } }) {
  return (
    <Indicador
      rotulo={r}
      valor={fmtPct(ind.valor)}
      base={<>{fmtNum(ind.numerador)} de {fmtNum(ind.denominador)} {ind.rotulo_denominador}</>}
      dica={`Fórmula: ${ind.formula}`}
    />
  );
}

export function SeloCategoria({ codigo }: { codigo: string }) {
  return <span className="selo"><span className="ponto" style={{ background: COR_CATEGORIA[codigo] }} aria-hidden />{rotulo(CATEGORIAS, codigo)}</span>;
}

export function SeloGrau({ grau }: { grau: number }) {
  return <span className="selo" title="Grau de evidência documental (não mede qualidade do cuidado)">{GRAUS[grau]?.replace(" — ", ": ") ?? grau}</span>;
}

const CLASSE_SITUACAO: Record<string, string> = {
  concluida_com_iniciativas: "selo-ok", concluida_sem_iniciativas: "", inconclusiva: "selo-alerta",
  aguardando_validacao: "selo-alerta", em_pesquisa: "selo-alerta", nao_pesquisada: "",
};
export function SeloSituacao({ situacao }: { situacao: string }) {
  return <span className={`selo ${CLASSE_SITUACAO[situacao] ?? ""}`}>{rotulo(SITUACOES_CURTAS, situacao)}</span>;
}

export function SeloVerificacao({ v }: { v: string }) {
  const cls = v === "confirmado" ? "selo-ok" : v === "nao_localizado" ? "selo-perigo" : "selo-alerta";
  return <span className={`selo ${cls}`}>{v === "confirmado" ? "✓ " : v === "nao_localizado" ? "✕ " : "! "}{rotulo(VERIFICACAO, v)}</span>;
}

export function SeloDemo({ origem }: { origem?: string }) {
  return origem === "demonstrativo" ? <span className="selo selo-demo">DADO DEMONSTRATIVO (fictício)</span> : null;
}

export function Paginacao({ pagina, totalPaginas, total, aoMudar }: { pagina: number; totalPaginas: number; total: number; aoMudar: (p: number) => void }) {
  if (totalPaginas <= 1) return <p className="muito-discreto" style={{ textAlign: "center" }}>{fmtNum(total)} registro(s)</p>;
  return (
    <nav className="paginacao" aria-label="Paginação">
      <button className="botao botao-sec botao-peq" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>← Anterior</button>
      <span className="discreto num">Página {pagina} de {totalPaginas} · {fmtNum(total)} registros</span>
      <button className="botao botao-sec botao-peq" disabled={pagina >= totalPaginas} onClick={() => aoMudar(pagina + 1)}>Próxima →</button>
    </nav>
  );
}

export function AvisoCobertura({ concluidas, universo }: { concluidas?: number; universo?: number }) {
  return (
    <div className="aviso" role="note">
      <strong>Cobertura em construção.</strong>{" "}
      {universo !== undefined && <>A pesquisa documental foi concluída em {fmtNum(concluidas)} de {fmtNum(universo)} universidades. </>}
      Os resultados dependem das fontes públicas consultadas: <em>“nenhuma iniciativa localizada”</em> não significa que a universidade
      não possua iniciativas, e a quantidade de registros não mede a qualidade do cuidado. <Link to="/metodologia">Ver metodologia</Link>.
    </div>
  );
}

export function BotoesExportacao({ tipo, params, rotulo: r = "Exportar" }: { tipo: string; params: string; rotulo?: string }) {
  return (
    <span className="linha nao-imprimir" style={{ gap: 6 }}>
      <span className="muito-discreto">{r}:</span>
      <a className="botao botao-sec botao-peq" href={`/api/publico/exportar/${tipo}.csv${params}`} download>CSV</a>
      <a className="botao botao-sec botao-peq" href={`/api/publico/exportar/${tipo}.xlsx${params}`} download>Excel</a>
    </span>
  );
}

/** Grupo de botões de alternância (seleção múltipla) — acessível por teclado, estado em aria-pressed. */
export function Chips({ opcoes, selecionados, aoMudar, rotuloGrupo }: { opcoes: Record<string, string>; selecionados: string[]; aoMudar: (v: string[]) => void; rotuloGrupo: string }) {
  return (
    <div className="chips" role="group" aria-label={rotuloGrupo}>
      {Object.entries(opcoes).map(([k, v]) => {
        const ativo = selecionados.includes(k);
        return (
          <button key={k} type="button" className="chip" aria-pressed={ativo}
            onClick={() => aoMudar(ativo ? selecionados.filter((x) => x !== k) : [...selecionados, k])}>{v}</button>
        );
      })}
    </div>
  );
}
