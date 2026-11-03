# Pesquisa-piloto (22/10/2026)

## Escopo

14 universidades, escolhidas para cobrir as cinco regiões e diferentes categorias administrativas, incluindo integralmente o campo empírico do
projeto *“Qual o preço a se pagar pela dor?”* (federais do RS e UFFS) e a UERGS, citada nesse projeto como ampliação possível.

| Lote | Universidades |
|---|---|
| `rs` (`data/piloto/lote_rs.json`) | UFRGS, UFPel, FURG, UFCSPA, UNIPAMPA, UFSM, UFFS (federais), UERGS (estadual) |
| `regioes` (`data/piloto/lote_regioes.json`) | UFPA (Norte), UFPE (Nordeste), UnB (Centro-Oeste), USP (Sudeste, estadual), UFSC (Sul), PUCRS (privada sem fins lucrativos, comunitária/confessional) |

## Método

- Buscas e leitura de páginas reais na web com assistência de IA (Claude Code: WebSearch + WebFetch, com downloads diretos e extração local de PDFs), seguindo o [protocolo](PROTOCOLO_PESQUISA.md).
- Cada lote registra consultas feitas, fontes consultadas (inclusive falhas), resultado declarado e pendências por universidade.
- Importação no sistema como **execuções de coleta** (`PILOTO-<LOTE>-<SIGLA>`) e **candidatos pendentes** — porque uma identificação por IA não confirma uma iniciativa.
- Reverificação independente: o coletor do sistema baixou novamente cada fonte e conferiu o trecho literal (`logs/verificacao_trechos_piloto*.log`).

## Resultados (candidatos — ainda **não validados**)

| Universidade | UF | Categoria adm. | Candidatos | Trecho confirmado | Política | Serviço | Extensão | Ação | Pesquisa/formação | Sugestões Nível 1 |
|---|---|---|---|---|---|---|---|---|---|---|
| UFRGS | RS | federal | 9 | 9 | 1 | 4 | 3 | 0 | 1 | 1 |
| UFPel | RS | federal | 10 | 9 | 0 | 4 | 2 | 1 | 3 | 0 |
| FURG | RS | federal | 10 | 9 | 2 | 2 | 2 | 3 | 1 | 1 |
| UFCSPA | RS | federal | 5 | 4 | 0 | 2 | 1 | 2 | 0 | 0 |
| UNIPAMPA | RS | federal | 6 | 5 | 1 | 3 | 1 | 1 | 0 | 2 |
| UFSM | RS | federal | 10 | 10 | 3 | 4 | 1 | 1 | 1 | 2 |
| UFFS | SC | federal | 8 | 7 | 2 | 2 | 2 | 1 | 1 | 1 |
| UERGS | RS | estadual | 9 | 9 | 1 | 1 | 1 | 5 | 1 | 1 |
| PUCRS | RS | privada s/ fins lucrativos | 6 | 6 | 0 | 4 | 1 | 1 | 0 | 0 |
| UFPA | PA | federal | 6 | 6 | 0 | 3 | 2 | 1 | 0 | 0 |
| UFPE | PE | federal | 6 | 6 | 2 | 2 | 1 | 0 | 1 | 1 |
| UnB | DF | federal | 5 | 5 | 2 | 2 | 0 | 1 | 0 | 2 |
| USP | SP | estadual | 6 | 6 | 2 | 2 | 0 | 1 | 1 | 0 |
| UFSC | SC | federal | 7 | 7 | 3 | 3 | 0 | 1 | 0 | 2 |
| **Total** | | | **103** | **98** | 19 | 38 | 17 | 19 | 10 | 13 |

“Sugestões Nível 1” são classificações propostas; o sistema só aceita Nível 1 na validação se houver documento normativo vinculado.

### Trechos que exigem conferência manual

| Candidato | Situação na reverificação |
|---|---|
| UFPel #47 — Núcleo Psicopedagógico de Atenção ao Discente (NUPADI) | PDF acessado, trecho **não localizado** literalmente |
| UNIPAMPA #76 — Projeto de Extensão Saúde Mental e Bem-estar na Universidade | PDF acessado, trecho **não localizado** literalmente |
| UFFS #92 — Campanha Setembro Amarelo (2017) | Fonte em formato ODT (não suportado pelo coletor) |
| FURG #61 — Mini-Conferências Setoriais de Saúde Mental | Arquivo acima de 30 MB |
| UFCSPA #66 — Núcleo de Apoio Psicossocial (NAP) | Conexão encerrada pelo servidor durante a conferência |

Os demais 98 trechos foram localizados literalmente nas fontes em 22–23/10/2026.

## Principais lacunas registradas pelos pesquisadores assistentes

- **UFRGS:** ato de criação do programa Saber Viver localizado (Portaria 7715/2022), mas é amplo (saúde e bem-estar estudantil); sem resolução específica do CONSUN; páginas de FALAQUÍ e PROA a ler.
- **UFPel:** nenhuma resolução específica de saúde mental localizada (só a lista de 2026 do CONSUN foi integralmente conferida); sem serviço permanente para servidores; o serviço-escola de psicologia não tem página própria localizada.
- **FURG:** Portaria GAB 126/2025 cria Comitê de Gestão em Saúde Mental; a Política de Saúde Mental está em **minuta em consulta** (Nível 2, não 1) — aprovação pelo CONSUN não confirmada; progep.furg.br inacessível.
- **UFCSPA:** repositório e sistema de extensão recusaram conexões; uma capacitação em prevenção do suicídio (2022) e projetos de edital de extensão ficaram de fora.
- **UNIPAMPA:** Portaria GR 1062/2025 institui programa de saúde mental para estudantes; ato de criação do Núcleo de Saúde Mental não localizado.
- **UFSM:** Res. 110/2022 (Comitê de Saúde Mental) e IN 006/2024 (posvenção); sem política abrangente localizada; portal de extensão não percorrido.
- **UFFS:** política de assistência estudantil (2019) inclui atenção à saúde mental, mas não é específica; alterações posteriores não conferidas.
- **UERGS:** política de ações afirmativas (Res. CONSUN 001/2026) com diretriz de saúde mental; sem política específica.
- **UFPA:** sem resolução de política; PROREDE evidenciado por edital; fontes de 2020 para plantão e Projeto Acolher.
- **UFPE:** Portaria PROAES 05/2024 (PROMENTAL); política institucional em minuta (consulta encerrada em 12/10/2025, sem ato de aprovação localizado).
- **UnB:** Resolução CAD 050/2024 (política) e DAC 004/2024 (PROSAM); ato do CoPESM não localizado (notícias com 404).
- **USP:** programas estruturados (ECOS, diretoria de saúde mental da PRIP, protocolo de emergência) sem ato normativo localizado.
- **UFSC:** RN 163/2022/CUn (política); portaria do comitê e plano de implementação não obtidos; campi fora de Florianópolis não verificados.
- **PUCRS:** nenhuma política institucional localizada; ações para servidores vistas só em resultados de busca.

## Matriz de cobertura após o piloto

| Situação | Universidades |
|---|---|
| Aguardando validação (piloto) | 14 |
| Não pesquisada | 192 |
| Concluída (com ou sem iniciativas) | 0 |

Arquivo completo: `data/cobertura/matriz_cobertura_2026-10-22.csv` (exportação de `/api/publico/exportar/universidades.csv`).

## Próximo passo do piloto

Revisão humana dos 103 candidatos (`/admin/revisao`), conferência manual dos 5 trechos sinalizados e, por universidade, a declaração de
pesquisa concluída ou inconclusiva. Só então os indicadores públicos passam a refletir o piloto.

## Piloto inicial restrito: FURG e UFRGS (23/10/2026)

Por decisão do pesquisador responsável, a primeira validação concentrou-se na FURG e na UFRGS. Os candidatos das outras 12 universidades seguem pendentes.

- **Coletas automáticas locais** (SearXNG + `qwen2.5:7b`): FURG em 3 execuções (25 + 8 páginas; a 3ª falhou porque os motores de busca bloquearam as consultas por volume) e UFRGS em 1 execução (25 páginas, 15 candidatos).
- **Revisão:** 44 candidatos decididos — revisão **assistida por IA (Claude), por delegação do pesquisador**, registrada na conta “Claude — revisão assistida por IA”. As decisões e justificativas estão em `data/revisoes/revisao_2026-10-23_furg_ufrgs.json`, e cada iniciativa aprovada traz a nota nas Limitações públicas. **Recomenda-se conferência humana.**

| | FURG | UFRGS |
|---|---|---|
| Aprovados (viraram iniciativas) | 11 | 13 |
| Vinculados a iniciativa existente (evidência extra) | 3 | 9 |
| Inconclusivos | 2 | 1 |
| Rejeitados | 4 | 1 |
| **Iniciativas validadas** | **11** | **13** |

Critérios adotados: duplicatas viram evidência adicional da mesma iniciativa (nada é contado duas vezes); materiais educativos do mesmo órgão foram agrupados;
serviços municipais do SUS e trechos sem vínculo explícito com saúde mental foram rejeitados; minuta de política = Nível 2; ato que cria comitê (não a política) = Nível 2;
programa institucional instituído por portaria com objetivos explícitos de saúde mental (Saber Viver, UFRGS) = Nível 1.

Pendente: o pesquisador declarar a pesquisa da FURG e da UFRGS como **concluída** (aba Validação → “Concluir pesquisa”) para que entrem nos indicadores de cobertura.
