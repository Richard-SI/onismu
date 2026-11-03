import { useState, type FormEvent } from "react";
import { api, ErroApi } from "../api";

export function ReportarErro({ tipo, id }: { tipo: "universidade" | "iniciativa" | "geral"; id?: number }) {
  const [aberto, setAberto] = useState(tipo === "geral");
  const [estado, setEstado] = useState<"" | "enviando" | "ok">("");
  const [erro, setErro] = useState("");
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEstado("enviando"); setErro("");
    try {
      await api("/api/publico/relatos", { corpo: {
        tipo_registro: tipo, registro_id: id ?? null, descricao: String(f.get("descricao") ?? ""),
        url_referencia: String(f.get("url") ?? ""), contato: String(f.get("contato") ?? ""), site: String(f.get("site") ?? ""),
      } });
      setEstado("ok");
    } catch (x) {
      setEstado("");
      setErro(x instanceof ErroApi ? (x.detalhes?.[0]?.mensagem ? `${x.message} ${x.detalhes[0].campo}: ${x.detalhes[0].mensagem}` : x.message) : "Falha no envio.");
    }
  };
  if (estado === "ok") return <div className="sucesso" role="status">Relato recebido. Obrigado — a equipe analisará e, se procedente, corrigirá o registro com histórico.</div>;
  if (!aberto) return <button className="botao botao-sec botao-peq" onClick={() => setAberto(true)}>Reportar erro ou omissão neste registro</button>;
  return (
    <form className="cartao" onSubmit={enviar} aria-label="Reportar erro">
      <h3>Reportar erro ou omissão</h3>
      <p className="muito-discreto">Não inclua dados pessoais de terceiros nem relatos de atendimento. O contato é opcional e nunca é publicado.</p>
      <div className="campo"><label htmlFor="r-desc">O que está incorreto ou faltando?</label>
        <textarea id="r-desc" name="descricao" required minLength={10} maxLength={4000} /></div>
      <div className="campos">
        <div className="campo"><label htmlFor="r-url">Fonte que comprova (URL, opcional)</label><input id="r-url" name="url" type="url" /></div>
        <div className="campo"><label htmlFor="r-contato">Contato (opcional)</label><input id="r-contato" name="contato" type="text" maxLength={200} /></div>
      </div>
      <div className="sr-only" aria-hidden><label htmlFor="r-site">Não preencha</label><input id="r-site" name="site" tabIndex={-1} autoComplete="off" /></div>
      {erro && <div className="erro" role="alert">{erro}</div>}
      <button className="botao" disabled={estado === "enviando"}>{estado === "enviando" ? "Enviando…" : "Enviar relato"}</button>
    </form>
  );
}
