import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "../config.js";
import { esquemaRespostaExtracao, type ContextoExtracao, type Extrator, type RespostaExtracao } from "./esquema.js";
import { INSTRUCOES, montarMensagem } from "./prompt.js";

/** Limite de caracteres do documento enviados ao modelo (o restante é sinalizado, não descartado em silêncio). */
const MAX_CARACTERES = 120_000;



export class ExtratorClaude implements Extrator {
  nome: string;
  private cliente: Anthropic;

  constructor(cliente?: Anthropic, private modelo = config.CLAUDE_MODELO) {
    // Sem chave explícita, o SDK resolve a credencial do ambiente (ANTHROPIC_API_KEY ou perfil `ant auth login`).
    this.cliente = cliente ?? new Anthropic({ maxRetries: 3 });
    this.nome = `ia:${modelo}`;
  }

  async extrair(ctx: ContextoExtracao): Promise<RespostaExtracao> {
    const truncado = ctx.texto.length > MAX_CARACTERES;
    const texto = truncado ? ctx.texto.slice(0, MAX_CARACTERES) : ctx.texto;
    const mensagem = montarMensagem(ctx, texto, truncado ? `Atenção: o documento foi truncado em ${MAX_CARACTERES} caracteres.` : undefined);

    const resposta = await this.cliente.beta.messages.parse({
      model: this.modelo,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: INSTRUCOES,
      output_config: { effort: "medium", format: betaZodOutputFormat(esquemaRespostaExtracao) },
      messages: [{ role: "user", content: mensagem }],
    });

    if (resposta.stop_reason === "refusal") {
      throw new Error(`O modelo recusou a extração (${resposta.stop_details?.category ?? "sem categoria"}).`);
    }
    if (resposta.stop_reason === "max_tokens") throw new Error("Resposta do modelo truncada (max_tokens).");
    // Validação explícita pelo mesmo schema antes de aceitar qualquer dado.
    const validado = esquemaRespostaExtracao.safeParse(resposta.parsed_output);
    if (!validado.success) throw new Error(`Resposta do modelo fora do schema: ${validado.error.issues[0]?.message}`);
    if (truncado) {
      validado.data.observacoes = `${validado.data.observacoes ?? ""} [documento truncado em ${MAX_CARACTERES} caracteres]`.trim();
    }
    return validado.data;
  }
}
