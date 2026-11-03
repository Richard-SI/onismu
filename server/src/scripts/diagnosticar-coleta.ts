/**
 * Diagnóstico das integrações da coleta: busca, modelo local (Ollama) e credencial Anthropic.
 * Uso: npm run diagnosticar:coleta -w server
 * A verificação da Anthropic faz UMA chamada mínima (poucos tokens) para confirmar se a chave tem créditos.
 */
import Anthropic from "@anthropic-ai/sdk";
import { testarBusca, statusBusca } from "../coleta/busca.js";
import { statusOllama } from "../coleta/extrator-ollama.js";
import { config } from "../config.js";

const linha = (ok: boolean | null, nome: string, detalhe: string) =>
  console.log(`${ok === null ? "·" : ok ? "✓" : "✗"} ${nome.padEnd(22)} ${detalhe}`);

console.log(`Configuração atual: BUSCA_PROVEDOR=${config.BUSCA_PROVEDOR} · EXTRATOR=${config.EXTRATOR}\n`);

const b = statusBusca();
if (b.disponivel) {
  const t = await testarBusca();
  linha(t.ok, `Busca (${b.provedor})`, t.detalhe);
} else linha(null, "Busca", b.motivo ?? "");

const o = await statusOllama();
linha(o.disponivel, `Ollama (${config.OLLAMA_MODELO})`, o.motivo ?? `pronto em ${config.OLLAMA_URL}`);

if (!config.ANTHROPIC_API_KEY) {
  linha(null, "Anthropic", "ANTHROPIC_API_KEY não definida no .env (opcional).");
} else {
  try {
    const cliente = new Anthropic({ maxRetries: 0 });
    const r = await cliente.messages.create({
      model: config.CLAUDE_MODELO, max_tokens: 16, messages: [{ role: "user", content: "Responda apenas: ok" }],
    });
    linha(true, "Anthropic", `chave válida e com créditos (modelo ${r.model}, ${r.usage.input_tokens + r.usage.output_tokens} tokens usados)`);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) linha(false, "Anthropic", "chave inválida ou revogada (401).");
    else if (e instanceof Anthropic.PermissionDeniedError) linha(false, "Anthropic", `sem permissão (403): ${e.message}`);
    else if (e instanceof Anthropic.RateLimitError) linha(false, "Anthropic", `limite de uso/gasto atingido (429): ${e.message}`);
    else if (e instanceof Anthropic.BadRequestError) linha(false, "Anthropic", `requisição recusada (400) — sem créditos costuma aparecer aqui: ${e.message}`);
    else if (e instanceof Anthropic.APIError) linha(false, "Anthropic", `erro ${e.status}: ${e.message}`);
    else linha(false, "Anthropic", `falha de conexão: ${(e as Error).message}`);
  }
}
