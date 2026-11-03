# Arquitetura

## Visão geral

```
navegador ──► web (React + Vite, SPA)  ──/api──►  server (Node + Express + TypeScript)  ──►  PostgreSQL 16
                                                      │
                                                      └─► coleta: busca (Brave) · fetch seguro · extração (Claude | heurística)
```

Monorepo npm (`workspaces`): `server/` (API, coleta, scripts, testes) e `web/` (interface). Em produção, o mesmo processo
Node serve a API e o front-end compilado (`web/dist`).

| Camada | Escolhas | Motivo |
|---|---|---|
| Front-end | React 19, TypeScript, Vite, React Router, Recharts, d3-geo | Stack preferencial do projeto; d3-geo desenha a malha oficial do IBGE sem serviço de mapas externo |
| Back-end | Node 24, TypeScript, Express 4, Zod 4 | API REST por recurso, validação por schema em todas as entradas, tratador central de erros |
| Banco | PostgreSQL 16 (`pg_trgm`, `unaccent`), SQL puro com `pg` | Consultas parametrizadas, índices de trigramas para busca e deduplicação |
| Migrações | `server/migrations/NNN_nome.sql` + `schema_migrations`, aplicadas em transação com *advisory lock* | Versionadas, sem dependência extra |
| Autenticação | Sessão em cookie `httpOnly`/`SameSite=Strict`, token aleatório (só o SHA-256 vai ao banco), senhas com `scrypt` | Sem dependência externa; revogável no servidor |
| IA | SDK oficial `@anthropic-ai/sdk`, modelo `claude-opus-5-5`, saída estruturada validada por Zod | Ver [COLETA.md](COLETA.md) |
| Testes | Vitest + Supertest (banco real `onismu_test`), Testing Library (jsdom) | Testes de integração contra PostgreSQL real |

## Módulos do servidor (`server/src`)

| Caminho | Responsabilidade |
|---|---|
| `app.ts`, `index.ts` | Montagem do Express: helmet/CSP, CORS restrito, limite de JSON, *rate limit*, rotas, estáticos de produção |
| `auth/sessao.ts` | Sessões, `exigirAutenticacao(papéis)`, cabeçalho anti-CSRF `x-onismu-requisicao` |
| `routes/publico.ts` | API pública **somente leitura** (+ relato de erro com limite de taxa) |
| `routes/admin-*.ts` | Registros, revisão/coleta/duplicidades, sistema (histórico, tarefas, usuários, relatos, exportação) |
| `services/` | Regras de negócio: iniciativas (validação, duplicidades), candidatos (aprovação etc.), universidades (situação), indicadores, exportação, relatório PDF |
| `coleta/` | `busca.ts` (consultas e provedor), `fetcher.ts` (SSRF, robots, limites), `conteudo.ts` (HTML/PDF → texto), `extrator-*.ts`, `validacao.ts`, `pipeline.ts`, `fila.ts`, `verificar-trecho.ts` |
| `lib/` | URL (validação/normalização), texto, senhas, histórico, paginação/filtros, planilhas (CSV/XLSX seguros), geografia |
| `scripts/` | migrar, importar universo/piloto, verificar trechos, criar admin, dados demo, coleta agendada, backup |

## Modelo de dados

Tabelas principais (ver `server/migrations/001_esquema_inicial.sql`):

- **universidades** — identificação, `codigo_institucional` (e-MEC/INEP, único), categoria administrativa, região/UF/município, site e domínio,
  `situacao_pesquisa` (6 estados), `data_ultima_verificacao`, fonte do cadastro, `origem_dados` (`real`/`demonstrativo`).
- **campi** — unidades por universidade.
- **categorias** e **publicos_alvo** — taxonomia controlada e administrável (códigos estáveis; nomes/descrições editáveis; `ativa`).
- **iniciativas** — campos descritivos, categoria principal (FK), `grau_evidencia` (1–4), `status_validacao`, `situacao_documentada`,
  `data_ultima_evidencia`, `data_ultima_verificacao`, validador, `origem_dados`. N:N com categorias secundárias, públicos e documentos.
- **iniciativa_relacoes** — `vinculada_a_politica`, `parte_de`, `relacionada`, `duplicata_de` (relacionar sem duplicar contagem).
- **documentos** — atos normativos e relatórios (tipo, número, data, órgão emissor, URL normalizada única por universidade).
- **fontes** — URL original e **canônica (única)**, tipo, datas de publicação e consulta, situação da fonte.
- **evidencias** — trecho literal que liga uma fonte a uma iniciativa (N:N com conteúdo próprio) + resultado da verificação do trecho.
- **coleta_execucoes**, **coleta_paginas**, **candidatos** — trilha completa da coleta: termos, páginas examinadas (com status/HTTP/erro),
  candidatos extraídos (JSON validado), decisões (quem, quando, por quê).
- **possiveis_duplicidades** — pares para revisão humana (nunca exclusão automática).
- **historico_alteracoes** — entidade, registro, campo, valor anterior/novo, data, responsável, justificativa.
- **usuarios**, **sessoes**, **tarefas_atualizacao**, **relatos_erro**.

Integridade: chaves estrangeiras, `CHECK` em todas as enumerações e intervalos, `UNIQUE` em códigos/URLs canônicas/slugs,
índices para os filtros frequentes e índices GIN de trigramas sobre nomes normalizados.

### Regras de negócio relevantes

- Publicação: o catálogo público mostra **somente** `status_validacao = 'validada'` e, por padrão, `origem_dados = 'real'`.
- Validar exige ≥ 1 evidência; **Nível 1** exige documento normativo vinculado (resolução, portaria, IN, política, regimento ou plano).
- “Concluir pesquisa” exige páginas efetivamente consultadas registradas e nenhum candidato pendente; o resultado
  (com/sem iniciativas) é **calculado** das iniciativas validadas e recalculado quando estas mudam.
- Toda alteração relevante grava histórico com responsável e justificativa.

## Decisões técnicas (registro)

1. **Sem ORM**: SQL parametrizado (`$1…`) via `pg`. Filtros dinâmicos montados por `Filtros` (nunca concatenam valores). Protege contra injeção SQL e mantém as consultas de indicadores legíveis.
2. **Sessão em cookie em vez de JWT**: revogação imediata (logout/desativação) e nenhum segredo de assinatura para gerenciar. CSRF mitigado por `SameSite=Strict` + cabeçalho customizado obrigatório.
3. **Universo pelo Censo da Educação Superior (INEP 2024)**: o portal de dados abertos do e-MEC bloqueou downloads automatizados (HTTP 403/401); os microdados do INEP trazem o mesmo código institucional (CO_IES = código e-MEC). Sites oficiais não constam nessa base e não foram inferidos.
4. **Nomes institucionais** do INEP vêm em maiúsculas; a importação altera apenas a caixa (“Universidade Federal do Rio Grande”), preservando o texto.
5. **Coleta em fila de processo único (concorrência 1)** com estado persistido: simples, gentil com os sites e suficiente para o volume (centenas de universidades). Execuções interrompidas por reinício são marcadas como tal.
6. **Extrator heurístico como alternativa real** quando não há credencial de IA: gera no máximo um candidato por página relevante, com trecho literal e confiança baixa. Nada é simulado.
7. **Pesquisa-piloto importada como candidatos**: o levantamento foi feito com assistência de IA (Claude Code); por isso entra na fila como pendente, e cada trecho foi reconferido pelo próprio coletor do sistema.
8. **Mapa** com a malha oficial do IBGE (API de malhas, qualidade mínima), anéis reorientados para d3-geo, escala sequencial de um só tom com legenda explícita (“quantidade de registros, não qualidade”) e tabela equivalente.
9. **Paleta categórica validada para daltonismo** (validador de contraste/ΔE em modo claro e escuro); cor fixa por categoria em toda a aplicação; todo gráfico tem alternância para tabela.
10. **React 19**: o npm instala o React 19 como dependência par (Recharts/Testing Library); padronizar evita duas cópias do React.
11. **Área administrativa com carregamento sob demanda** (`React.lazy`) para não pesar a consulta pública.
