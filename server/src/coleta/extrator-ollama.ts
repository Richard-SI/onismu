import { z } from "zod";
import { config } from "../config.js";
import { esquemaRespostaExtracao, type ContextoExtracao, type Extrator, type RespostaExtracao } from "./esquema.js";
import { INSTRUCOES, montarMensagem } from "./prompt.js";

/**
 * Tamanho de cada parte do documento enviada ao modelo local. Partes menores limitam a duração de cada
 * chamada (no Mac M4 com qwen2.5:7b, ~1 min por parte deste tamanho).
 */
const CARACTERES_POR_PARTE = 12_000;
/** Partes processadas por página; o restante é registrado nas observações (nunca descartado em silêncio). */
const MAX_PARTES = 6;

const ESQUEMA_JSON = z.toJSONSchema(esquemaRespostaExtracao);

export class ErroModeloLocal extends Error {}

/**
 * Extração estruturada com um modelo executado localmente pelo Ollama (sem custo por uso).
 * A saída é restringida pelo JSON Schema (`format`) e validada novamente pelo schema Zod.
 */
export class ExtratorOllama implements Extrator {
  nome: string;
  constructor(
    private url = config.OLLAMA_URL,
    private modelo = config.OLLAMA_MODELO,
    private contexto = config.OLLAMA_CONTEXTO,
    private timeoutMs = config.OLLAMA_TIMEOUT_MS,
  ) {
    this.nome = `local:${modelo}`;
  }

  private async chamar(mensagem: string, correcao?: string): Promise<RespostaExtracao> {
    const messages = [
      { role: "system", content: INSTRUCOES },
      { role: "user", content: mensagem },
      ...(correcao ? [{ role: "user", content: correcao }] : []),
    ];
    let r: Response;
    try {
      // stream: true faz o cabeçalho chegar imediatamente; sem isso, gerações longas estouram o
      // limite de 300 s que o cliente HTTP do Node impõe à chegada do cabeçalho ("fetch failed").
      r = await fetch(`${this.url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.modelo,
          messages,
          stream: true,
          format: ESQUEMA_JSON,
          options: { temperature: 0, num_ctx: this.contexto },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ErroModeloLocal(`Modelo local indisponível em ${this.url} (${(e as Error).message}). Inicie com "ollama serve".`);
    }
    if (!r.ok) {
      const corpo: any = await r.json().catch(() => ({}));
      const msg = String(corpo?.error ?? `HTTP ${r.status}`);
      throw new ErroModeloLocal(/not found/i.test(msg) ? `Modelo "${this.modelo}" não instalado. Rode: ollama pull ${this.modelo}` : `Ollama: ${msg}`);
    }
    let conteudo = "";
    let motivoFim: string | undefined;
    try {
      // Resposta em NDJSON: um objeto por linha, cada um com um pedaço do texto gerado.
      for (const linha of (await r.text()).split("\n")) {
        if (!linha.trim()) continue;
        const parte = JSON.parse(linha);
        if (parte.error) throw new ErroModeloLocal(`Ollama: ${parte.error}`);
        conteudo += parte.message?.content ?? "";
        if (parte.done) motivoFim = parte.done_reason;
      }
    } catch (e) {
      if (e instanceof ErroModeloLocal) throw e;
      throw new ErroModeloLocal(`Falha ao ler a resposta do modelo local: ${(e as Error).message}`);
    }
    if (motivoFim === "length") throw new ErroModeloLocal("Resposta do modelo local truncada (limite de contexto).");
    let json: unknown;
    try {
      json = JSON.parse(conteudo);
    } catch {
      throw new ErroModeloLocal("O modelo local devolveu JSON inválido.");
    }
    const v = esquemaRespostaExtracao.safeParse(json);
    if (!v.success) {
      throw new ErroModeloLocal(`Resposta do modelo local fora do schema: ${v.error.issues[0]?.path.join(".")} ${v.error.issues[0]?.message}`);
    }
    return v.data;
  }

  async extrair(ctx: ContextoExtracao): Promise<RespostaExtracao> {
    const partes: string[] = [];
    for (let i = 0; i < ctx.texto.length && partes.length < MAX_PARTES; i += CARACTERES_POR_PARTE) {
      partes.push(ctx.texto.slice(i, i + CARACTERES_POR_PARTE));
    }
    const restante = ctx.texto.length - MAX_PARTES * CARACTERES_POR_PARTE;
    const resultado: RespostaExtracao = { pagina_relevante: false, iniciativas: [], observacoes: null };
    const obs: string[] = [];
    for (const [k, parte] of partes.entries()) {
      const nota = partes.length > 1 ? `Parte ${k + 1} de ${partes.length} do documento.` : undefined;
      const mensagem = montarMensagem(ctx, parte, nota);
      let r: RespostaExtracao;
      try {
        r = await this.chamar(mensagem);
      } catch (e) {
        if (!(e instanceof ErroModeloLocal) || /indisponível|não instalado/.test(e.message)) throw e;
        // Uma nova tentativa com a indicação do problema; persistindo, o erro é registrado na execução.
        r = await this.chamar(mensagem, `Sua resposta anterior foi rejeitada (${e.message}). Responda somente com JSON válido no formato exigido.`);
      }
      resultado.pagina_relevante ||= r.pagina_relevante;
      const nomes = new Set(resultado.iniciativas.map((i) => i.nome.toLowerCase()));
      resultado.iniciativas.push(...r.iniciativas.filter((i) => !nomes.has(i.nome.toLowerCase())));
      if (r.observacoes) obs.push(r.observacoes);
    }
    if (restante > 0) obs.push(`[${restante} caracteres finais do documento não foram analisados pelo modelo local; revisar manualmente]`);
    resultado.iniciativas = resultado.iniciativas.slice(0, 15);
    resultado.observacoes = obs.length ? obs.join(" ") : null;
    return resultado;
  }
}

/** Verifica se o Ollama responde e se o modelo está instalado. */
export async function statusOllama(url = config.OLLAMA_URL, modelo = config.OLLAMA_MODELO) {
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const j: any = await r.json();
    const instalados: string[] = (j?.models ?? []).map((m: any) => String(m.name));
    const ok = instalados.some((n) => n === modelo || n === `${modelo}:latest`);
    return { disponivel: ok, motivo: ok ? null : `Modelo "${modelo}" não instalado (instalados: ${instalados.join(", ") || "nenhum"}). Rode: ollama pull ${modelo}` };
  } catch {
    return { disponivel: false, motivo: `Ollama não responde em ${url}. Inicie com "ollama serve".` };
  }
}
