# Protocolo de pesquisa

Versão 1.0 — 22/10/2026. Aplica-se a toda coleta (automática, por URLs informadas ou manual) e à revisão.

## 1. Universo e unidade de análise

- **Universo:** instituições com organização acadêmica “Universidade” nos Microdados do Censo da Educação Superior (INEP, 2024) — 206 universidades. Fonte e ano de referência ficam registrados em cada universidade (`data/universo/FONTE.md`).
- **Fora do escopo principal:** faculdades, centros universitários, institutos federais e CEFETs (2.355 IES em `data/universo/outras_ies_excluidas.csv`, para ampliação futura).
- **Unidade de análise:** a iniciativa institucional pública. Nunca se registram dados de pessoas atendidas.

## 2. Procedimento por universidade

1. Registrar a execução (automática no sistema): data, termos, ferramenta, responsável.
2. Consultar, nesta ordem de prioridade: site oficial; documentos normativos; pró-reitorias (assuntos estudantis, extensão, gestão de pessoas); sistemas de extensão; assistência estudantil/serviços de psicologia; relatórios de gestão; repositórios; publicações científicas; fontes secundárias (apenas para descoberta).
3. Termos (combinados com nome oficial, sigla e `site:<domínio>`; incluir busca de PDF): “saúde mental”; “política de saúde mental”; “atenção psicossocial”; “projeto de extensão” “saúde mental”; “acolhimento psicológico”; “serviço de psicologia”; “assistência estudantil” “saúde mental”; “promoção da saúde mental”; “sofrimento psíquico” estudantes; “programa institucional” “saúde mental”; “prevenção do suicídio”; resolução “saúde mental”. Não se limitar à primeira página de resultados.
4. Para cada iniciativa: copiar **trecho literal** (≤ 400 caracteres) que comprove existência e natureza; registrar URL, título, tipo de fonte, data de publicação (se houver) e data de consulta.
5. Registrar toda fonte consultada — inclusive as irrelevantes, inacessíveis ou bloqueadas — e as pendências.
6. Uma fonte secundária pode indicar uma iniciativa, mas deve-se buscar a evidência primária.

## 3. Taxonomia (categoria principal obrigatória; secundárias opcionais)

| Código | Categoria | Inclui |
|---|---|---|
| `politica_institucional` | Política institucional | Políticas formais de saúde mental/atenção psicossocial, planos institucionais de prevenção, diretrizes de acolhimento, normativas e resoluções, políticas de assistência estudantil com ações explícitas de saúde mental, programas formalmente estabelecidos. **Serviço de psicologia, por si só, não é política.** |
| `projeto_extensao` | Projeto de extensão | Acolhimento, grupos de escuta, rodas de conversa, oficinas, prevenção, campanhas educativas, bem-estar, combate ao estigma, ações para a comunidade universitária ou externa |
| `servico_permanente` | Serviço permanente | Serviços de psicologia, núcleos de apoio psicopedagógico, atenção psicossocial, clínicas-escola, assistência estudantil com atendimento, acompanhamento psicológico/psiquiátrico documentado |
| `acao_pontual` | Programa ou ação pontual | Campanhas, eventos, palestras, semanas temáticas, conscientização, ações periódicas ou isoladas |
| `pesquisa_formacao` | Pesquisa, formação e capacitação | Capacitação de servidores, formação de profissionais, grupos de pesquisa, pesquisa aplicada, disseminação de conhecimento |

Relações (`vinculada_a_politica`, `parte_de`, `relacionada`) ligam iniciativas sem duplicar contagens. Registrar sempre que disponível: público-alvo, abrangência, modalidade, situação documentada, unidade responsável.

## 4. Escala de evidência documental

| Nível | Critério |
|---|---|
| 1 — Política formalizada | Documento oficial que formaliza explicitamente a política (exige documento normativo vinculado no sistema) |
| 2 — Programa institucional estruturado | Programa documentado, sem formalização normativa localizada |
| 3 — Serviço ou ação institucional | Serviço ou atividade documentada, sem evidência de política abrangente |
| 4 — Evidência insuficiente | Documentação insuficiente para confirmar natureza ou situação |

Registrados separadamente: grau de evidência; status de validação; situação documentada (ativa, encerrada, desconhecida); atualidade da fonte (> 24 meses = desatualizada).
A escala mede a **documentação disponível**, não a qualidade do cuidado. Minutas e propostas em consulta não são Nível 1.

## 5. Revisão e decisão

- Abrir a fonte, conferir o trecho (o sistema também reconfere automaticamente), checar categoria, nível e campos.
- Decisões: aprovar; editar e aprovar; vincular a iniciativa existente (acrescenta evidência); inconclusivo; nova coleta; rejeitar (motivo obrigatório).
- Verificar as possíveis duplicidades indicadas antes de aprovar.
- Ao final, declarar a pesquisa da universidade **concluída** (exige fontes consultadas e nenhum candidato pendente) ou **inconclusiva**.

## 6. Situações de pesquisa

`nao_pesquisada` → `em_pesquisa` → `aguardando_validacao` → `concluida_com_iniciativas` | `concluida_sem_iniciativas` | `inconclusiva`.
“Concluída sem iniciativas localizadas” significa apenas que nada foi identificado nas fontes consultadas durante o procedimento documentado.

## 7. Atualização

Reverificar as fontes periodicamente (tarefas de atualização; sugestão: 180 dias para concluídas, 90 para inconclusivas). Fontes que saem do ar ou mudam são marcadas na gestão de fontes, sem apagar o histórico.
