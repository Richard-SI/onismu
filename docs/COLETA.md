# Coleta assistida

A coleta **sugere**; só a revisão humana **publica**. Fluxo implementado (`server/src/coleta/pipeline.ts`):

1. Pesquisador escolhe a universidade e o modo (**URLs informadas** ou **busca automática**).
2. Busca: consultas geradas de nome/sigla/domínio × 12 termos controlados, com `site:<domínio>` e `filetype:pdf`; percorre 2 páginas de 20 resultados por consulta; resultados deduplicados por URL canônica e priorizados (domínio oficial e PDFs primeiro).
3. Download seguro de até `COLETA_MAX_PAGINAS` páginas; as excedentes são registradas como “não examinadas” e viram pendência.
4. Extração de texto (HTML sem scripts/menus; PDF via pdf.js) e pré-filtro determinístico por termos de saúde mental.
5. Extração estruturada (Claude ou heurística) → **validação por schema** (Zod) → **validação determinística** (abaixo).
6. Candidatos gravados como **pendentes**, com página de origem, trecho conferido e possíveis duplicidades.
7. Revisão: aprovar, editar e aprovar, rejeitar, inconclusivo, solicitar nova coleta ou vincular a iniciativa existente — com responsável e data.
8. A universidade passa a “aguardando validação”; o pesquisador declara a conclusão (com/sem iniciativas é calculado) ou inconclusiva.

Falhas nunca são silenciosas: cada página registra status (`relevante`, `sem_termos`, `consultada`, `erro`, `bloqueada`, `ignorada`), HTTP e erro;
a execução termina `concluida`, `parcial` ou `falhou`. Se nenhuma fonte pôde ser consultada, a universidade **não** é marcada como pesquisada.

## Proteções

| Risco | Medida |
|---|---|
| SSRF / rede interna | Só `http(s)`, portas 80/443, sem credenciais na URL; IP literal e **DNS resolvido no momento da conexão** são rejeitados se privados/reservados (inclui 169.254.169.254, ::1, fc00::/7, IPv4 mapeado); cada redirecionamento é revalidado (máx. 5) |
| Abuso de recursos | Tempo limite por inatividade e total, limite de bytes (5 MB; 30 MB só na reverificação), tipos aceitos (HTML, PDF, texto), intervalo mínimo por host, fila com concorrência 1 |
| Política dos sites | `robots.txt` respeitado (páginas bloqueadas viram pendência para consulta manual); User-Agent identificado com contato (`COLETA_CONTATO`) |
| Injeção de instruções | Conteúdo externo vai ao modelo dentro de `<documento_nao_confiavel>`, com instrução de ignorar comandos; a marca de fechamento é neutralizada; o modelo não tem ferramentas, não segue links e não executa nada; segredos nunca entram no prompt |
| Alucinação | O trecho precisa existir **literalmente** na fonte (senão o candidato é descartado); unidade responsável, período, número e título de documento ausentes do texto são anulados e listados em `campos_ausentes`; a URL da evidência é sempre a página baixada (nunca a sugerida pelo modelo); fonte fora do domínio oficial vira “secundária” e não sustenta Níveis 1–2; Nível 1 sem documento é rebaixado; `necessita_revisao_humana` é sempre verdadeiro |

## Integrações

Resumo das opções (a busca encontra páginas; o extrator lê cada página e propõe candidatos):

| Papel | Opção gratuita e local (padrão atual) | Opção paga | Sem nada configurado |
|---|---|---|---|
| Busca | **SearXNG** em Docker (`BUSCA_PROVEDOR=searxng`) | Brave Search API (`BUSCA_PROVEDOR=brave`) | URLs informadas pelo pesquisador |
| Extração | **Ollama** com `qwen2.5:7b` (`EXTRATOR=ollama`) | Claude (`EXTRATOR=claude`) | Extrator heurístico (`EXTRATOR=heuristico`) |

Ordem das fontes examinadas: domínio oficial e páginas institucionais/normativas primeiro; teses, TCCs, artigos e repositórios por último
(não descrevem iniciativas institucionais). Diagnóstico de tudo: `npm run diagnosticar:coleta -w server`. Teste numa página sem gravar nada:
`npm run testar:extracao -w server -- <url> --sigla FURG`. Coleta pela linha de comando: `npm run coletar -w server -- --sigla FURG`.

### Busca local — SearXNG (gratuita)

```bash
docker compose up -d searxng           # http://127.0.0.1:8888 (só local)
# .env: BUSCA_PROVEDOR=searxng  SEARXNG_URL=http://127.0.0.1:8888  BUSCA_INTERVALO_MS=5000
```
SearXNG é um metabuscador de código aberto: repassa as consultas a motores públicos (no teste de 23/10/2026 responderam Brave e Google CSE)
e devolve JSON. Não exige chave. Limitações: os motores podem limitar ou pedir CAPTCHA em volume alto — por isso há pausa entre consultas,
e motores que não respondem são registrados como erro na execução. Em 23/10/2026, após duas coletas seguidas (~30 consultas),
o motor Brave respondeu “Suspended: too many requests” e o DuckDuckGo pediu CAPTCHA; por isso a pausa padrão é de 5 s e convém
espaçar lotes grandes (ex.: algumas universidades por hora, via tarefas agendadas). A configuração fica em `infra/searxng/settings.yml`
(fora do git, contém o segredo da instância; modelo em `settings.example.yml`).

### Extração local — Ollama (gratuita)

```bash
ollama serve                           # se não estiver rodando como serviço
ollama pull qwen2.5:7b                 # ~4,7 GB
# .env: EXTRATOR=ollama  OLLAMA_MODELO=qwen2.5:7b  OLLAMA_CONTEXTO=16384
```
- Mesmas instruções e mesma validação do extrator Claude; a saída é restringida pelo JSON Schema (`format`) e validada de novo pelo Zod, com uma nova tentativa se vier inválida.
- Páginas longas são divididas em até 6 partes de 12 mil caracteres; o que sobrar é registrado nas observações (nunca descartado em silêncio).
- A chamada usa streaming: sem isso, gerações acima de 300 s estouravam o limite do cliente HTTP do Node (“fetch failed”).
- Por que `qwen2.5:7b`: bom desempenho em português e em JSON estruturado, cabe com folga em 16 GB de RAM. Modelos “de raciocínio”
  (ex.: DeepSeek-R1) gastam muito tempo pensando e são menos estáveis para JSON; `llama3.2` (3B) é mais rápido, porém menos preciso;
  `llama3.1:8b` é alternativa equivalente. Troque com `OLLAMA_MODELO`.
- Desempenho medido (Mac M4, 16 GB, 23/10/2026): 30–40 s por parte de texto; ~1 min por página incluindo download →
  ~25 min por universidade (25 páginas); uma rodada nacional (206 universidades) leva ~4 dias de máquina. Rode por lotes/tarefas agendadas.
- Coletas reais de teste (FURG): 25 páginas em 48,7 min → 6 candidatos (antes da nova priorização); 8 páginas em 7,8 min → 4 candidatos,
  todas as páginas institucionais. Erros observados do modelo: comitê classificado como extensão; serviço municipal (CAPS) e uma portaria de
  suspensão de aulas sugeridos como iniciativas — rejeitáveis na revisão.
- Qualidade: modelos de 7B erram mais a **categoria** e o **nível** (no teste, um comitê institucional saiu como “projeto de extensão”).
  Os trechos continuam conferidos literalmente na fonte, e a revisão humana corrige a classificação.


### Busca — Brave Search API (paga, opcional)

```
BUSCA_PROVEDOR=brave
BRAVE_API_KEY=...
```
Cada universidade gera ~15 consultas × até 2 páginas ≈ **até 30 requisições**. Em 23/10/2026, <https://brave.com/search/api/> informava
US$ 5 por 1.000 requisições com US$ 5 de créditos gratuitos por mês (≈ 1.000 requisições ≈ 33 universidades/mês) e pedia cartão de crédito
“para evitar abuso”. Uma rodada completa (≈ 6.200 requisições) custaria ≈ US$ 31. Confira os valores vigentes. Sem provedor, use **URLs informadas** (funciona sem nenhuma chave).
Outro provedor pode ser adicionado implementando a interface `ProvedorBusca` em `server/src/coleta/busca.ts`.

### Extração por IA — Claude (paga, opcional)

```
EXTRATOR=claude
ANTHROPIC_API_KEY=...          # ou um perfil de `ant auth login`
CLAUDE_MODELO=claude-opus-5-5
```
Usa o SDK oficial (`client.beta.messages.parse`) com saída estruturada pelo schema `esquemaRespostaExtracao`, esforço `medium`
e *fallback* do servidor habilitado (`fallbacks: "default"`), que reexecuta em outro modelo quando a requisição é recusada pelos classificadores de segurança.
Recusas, truncamento e respostas fora do schema geram erro registrado na execução (nada é gravado).
Custo de referência (`claude-opus-5-5`: US$ 4 / 1M tokens de entrada, US$ 20 / 1M de saída): uma página de ~10 mil tokens com ~1,5 mil de saída custa ≈ US$ 0,07;
25 páginas por universidade ≈ US$ 1,75; 206 universidades ≈ US$ 360 por rodada completa (estimativa; confira a tabela vigente).
A API exige créditos pré-pagos no Console (a documentação de preços menciona uma pequena quantia gratuita para novos usuários, sem valor garantido).
Para saber se a sua chave funciona, coloque-a no `.env` e rode `npm run diagnosticar:coleta -w server` (faz uma única chamada mínima).

## Reverificação de trechos

`npm run verificar:trechos -w server` baixa novamente a fonte de cada candidato pendente e confere o trecho literal
(também disponível por candidato na tela de revisão). Útil para lotes importados e para detectar fontes alteradas.

## Coleta agendada

Tarefas de atualização (escopo por região/UF/situação, periodicidade, limite) são cadastradas na administração e executadas por
`npm run coleta:agendada -w server` (agende no cron). Sem provedor de busca, o script encerra com código 2 e informa o motivo.
