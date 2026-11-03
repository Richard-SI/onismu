import { useState, type FormEvent } from "react";
import { useApi } from "../../api";
import { Chips } from "../../componentes/base";
import {
  ABRANGENCIAS, CATEGORIAS, GRAUS, MODALIDADES, PUBLICOS, SITUACOES_DOC, STATUS_VALIDACAO, TIPOS_DOCUMENTO, TIPOS_FONTE,
} from "../../rotulos";

export interface ValoresIniciativa {
  nome: string; descricao?: string | null; objetivos?: string | null; unidade_responsavel?: string | null; universidade_id?: number;
  categoria_principal: string; categorias_secundarias: string[]; publicos: string[]; modalidade?: string | null; abrangencia?: string | null;
  data_inicio?: string | null; data_fim?: string | null; situacao_documentada: string; periodicidade?: string | null; grau_evidencia: number;
  status_validacao?: string; limitacoes?: string | null; documentos_ids: number[]; justificativa?: string | null;
  evidencias?: { url: string; titulo: string | null; tipo_fonte: string; trecho_evidencia: string }[];
}

export function FormIniciativa({ iniciais, universidadeId, modo, aoEnviar, ocupado }: {
  iniciais: ValoresIniciativa; universidadeId: number; modo: "criar" | "editar" | "aprovar";
  aoEnviar: (v: ValoresIniciativa) => void; ocupado?: boolean;
}) {
  const [v, setV] = useState<ValoresIniciativa>(iniciais);
  const [ev, setEv] = useState({ url: "", titulo: "", tipo_fonte: "site_institucional", trecho_evidencia: "" });
  const { dados: docs } = useApi<any>(`/api/admin/documentos?universidade_id=${universidadeId}`);
  const set = (k: keyof ValoresIniciativa, x: unknown) => setV((a) => ({ ...a, [k]: x === "" ? null : x }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const evidencias = ev.url && ev.trecho_evidencia ? [{ ...ev, titulo: ev.titulo || null }] : [];
    aoEnviar({ ...v, universidade_id: universidadeId, evidencias });
  };
  const campoTexto = (k: keyof ValoresIniciativa, rot: string, area = false) => (
    <div className="campo">
      <label htmlFor={`fi-${k}`}>{rot}</label>
      {area ? <textarea id={`fi-${k}`} value={(v[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />
        : <input id={`fi-${k}`} type="text" value={(v[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />}
    </div>
  );
  const selecao = (k: keyof ValoresIniciativa, rot: string, opcoes: Record<string, string>, vazio = true) => (
    <div className="campo">
      <label htmlFor={`fi-${k}`}>{rot}</label>
      <select id={`fi-${k}`} value={(v[k] as string) ?? ""} onChange={(e) => set(k, k === "grau_evidencia" ? Number(e.target.value) : e.target.value)}>
        {vazio && <option value="">Não informado</option>}
        {Object.entries(opcoes).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
      </select>
    </div>
  );
  return (
    <form onSubmit={enviar} className="pilha" aria-label="Dados da iniciativa">
      <div className="campo"><label htmlFor="fi-nome">Nome *</label>
        <input id="fi-nome" type="text" required minLength={3} value={v.nome} onChange={(e) => set("nome", e.target.value)} /></div>
      {campoTexto("descricao", "Descrição (somente o que consta na fonte)", true)}
      {campoTexto("objetivos", "Objetivos", true)}
      <div className="campos">
        {selecao("categoria_principal", "Categoria principal *", CATEGORIAS, false)}
        {selecao("grau_evidencia", "Grau de evidência *", GRAUS as any, false)}
        {selecao("situacao_documentada", "Situação documentada", SITUACOES_DOC, false)}
        {modo !== "aprovar" && selecao("status_validacao", "Status de validação", STATUS_VALIDACAO, false)}
      </div>
      <div className="campo"><label>Categorias secundárias</label>
        <Chips rotuloGrupo="Categorias secundárias" opcoes={Object.fromEntries(Object.entries(CATEGORIAS).filter(([k]) => k !== v.categoria_principal))}
          selecionados={v.categorias_secundarias} aoMudar={(x) => set("categorias_secundarias", x)} /></div>
      <div className="campo"><label>Público-alvo</label>
        <Chips rotuloGrupo="Público-alvo" opcoes={PUBLICOS} selecionados={v.publicos} aoMudar={(x) => set("publicos", x)} /></div>
      <div className="campos">
        {campoTexto("unidade_responsavel", "Unidade responsável")}
        {selecao("modalidade", "Modalidade", MODALIDADES)}
        {selecao("abrangencia", "Abrangência", ABRANGENCIAS)}
        {selecao("periodicidade", "Periodicidade", { permanente: "Permanente", periodica: "Periódica", pontual: "Pontual", desconhecida: "Desconhecida" })}
      </div>
      <div className="campos">
        <div className="campo"><label htmlFor="fi-ini">Data de início</label><input id="fi-ini" type="date" value={v.data_inicio ?? ""} onChange={(e) => set("data_inicio", e.target.value)} /></div>
        <div className="campo"><label htmlFor="fi-fim">Data de término</label><input id="fi-fim" type="date" value={v.data_fim ?? ""} onChange={(e) => set("data_fim", e.target.value)} /></div>
      </div>
      {campoTexto("limitacoes", "Limitações do registro", true)}
      <div className="campo">
        <label htmlFor="fi-docs">Documentos vinculados {v.grau_evidencia === 1 && <span className="muito-discreto">(Nível 1 exige documento normativo)</span>}</label>
        <select id="fi-docs" multiple value={v.documentos_ids.map(String)} onChange={(e) => set("documentos_ids", [...e.target.selectedOptions].map((o) => Number(o.value)))}>
          {(docs?.itens ?? []).map((d: any) => <option key={d.id} value={d.id}>{TIPOS_DOCUMENTO[d.tipo_documento]} — {d.titulo}</option>)}
        </select>
        <span className="muito-discreto">Cadastre documentos em “Documentos e fontes”. Use Ctrl/⌘ para selecionar vários.</span>
      </div>
      {modo !== "aprovar" && (
        <fieldset className="cartao">
          <legend><strong>{modo === "criar" ? "Evidência (obrigatória para validar)" : "Acrescentar evidência"}</strong></legend>
          <div className="campos">
            <div className="campo"><label htmlFor="fe-url">URL da fonte</label><input id="fe-url" type="url" value={ev.url} onChange={(e) => setEv({ ...ev, url: e.target.value })} /></div>
            <div className="campo"><label htmlFor="fe-tit">Título da fonte</label><input id="fe-tit" type="text" value={ev.titulo} onChange={(e) => setEv({ ...ev, titulo: e.target.value })} /></div>
            <div className="campo"><label htmlFor="fe-tipo">Tipo de fonte</label>
              <select id="fe-tipo" value={ev.tipo_fonte} onChange={(e) => setEv({ ...ev, tipo_fonte: e.target.value })}>
                {Object.entries(TIPOS_FONTE).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></div>
          </div>
          <div className="campo"><label htmlFor="fe-trecho">Trecho literal da fonte</label>
            <textarea id="fe-trecho" value={ev.trecho_evidencia} onChange={(e) => setEv({ ...ev, trecho_evidencia: e.target.value })} /></div>
        </fieldset>
      )}
      {campoTexto("justificativa", "Justificativa da alteração (registrada no histórico)")}
      <div><button className="botao" disabled={ocupado}>{modo === "aprovar" ? "Salvar edições e aprovar" : modo === "criar" ? "Criar iniciativa" : "Salvar alterações"}</button></div>
    </form>
  );
}
