# API

Base: `/api`. Respostas JSON; erros no formato `{ "erro": "mensagem", "detalhes": [{ "campo", "mensagem" }] }`.
Listas paginadas: `pagina` (≥ 1) e `por_pagina` (1–200) → `{ itens, total, pagina, por_pagina, total_paginas }`.
Filtros de lista aceitam valores separados por vírgula (`estado=RS,SC`).

## Pública (sem autenticação, somente leitura)

Filtros comuns de recorte: `regiao`, `estado`, `categoria_administrativa`, `demo=true` (inclui dados demonstrativos — excluídos por padrão).

| Método e rota | Descrição |
|---|---|
| `GET /publico/indicadores` | Indicadores com numerador, denominador e fórmula; situação da pesquisa; distribuição por categoria, região e grau; evolução das verificações; registros em validação (separados) |
| `GET /publico/mapa` | Agregados por UF (universo, concluídas, não pesquisadas, com iniciativas, iniciativas validadas por categoria) |
| `GET /publico/universidades` | Matriz de cobertura. Filtros: `q`, `situacao_pesquisa`, `ordenar` (`nome`, `estado`, `iniciativas`, `verificacao`) |
| `GET /publico/universidades/:id` | Identificação, situação, iniciativas validadas, documentos, fontes, resumo da coleta e pendências de cobertura |
| `GET /publico/iniciativas` | Catálogo (só validadas). Filtros: `q`, `universidade_id`, `categoria`, `incluir_secundarias`, `publico`, `situacao_documentada`, `grau_evidencia`, `tem_documento_normativo`, `ordenar` (`universidade`, `nome`, `grau`, `recentes`) |
| `GET /publico/iniciativas/:id` | Detalhe com evidências (trecho, fonte, data de consulta, verificação), documentos, relações e atualidade da fonte |
| `GET /publico/comparar?ids=1,2,…` | Comparação descritiva de 2 a 8 universidades |
| `GET /publico/comparacao-tematica` | Políticas × extensão (denominador: universidades com pesquisa concluída), região × categoria, públicos, evidências por categoria |
| `GET /publico/taxonomia` | Categorias, públicos-alvo, níveis de evidência |
| `GET /publico/atualizacoes` | Histórico público agregado de coletas e validações |
| `GET /publico/exportar/:tipo.:formato` | `tipo` ∈ `universidades`, `iniciativas`, `politicas`, `extensao`, `documentos`, `fontes`, `indicadores`; `formato` ∈ `csv`, `xlsx`. Respeita os filtros; protegido contra CSV injection |
| `GET /publico/relatorio.pdf` | Relatório com resumo, indicadores, gráfico, metodologia, data de corte, limitações e fontes |
| `POST /publico/relatos` | Relato de erro (`tipo_registro`, `registro_id`, `descricao`, `url_referencia?`, `contato?`). Limite: 10/h por IP. Não altera registros |

## Autenticação

| Rota | Descrição |
|---|---|
| `POST /auth/login` `{ email, senha }` | Cria sessão (cookie `onismu_sessao`, `httpOnly`, `SameSite=Strict`, `Secure` em produção). Limite: 10 tentativas/15 min |
| `POST /auth/logout` | Encerra a sessão |
| `GET /auth/sessao` | Usuário atual ou `null` |

Toda requisição que altera dados (`POST`/`PUT`/`DELETE`) deve enviar o cabeçalho **`x-onismu-requisicao: 1`**.

## Administrativa (`/admin/*` — sessão obrigatória; papéis `admin` ou `pesquisador`)

| Grupo | Rotas |
|---|---|
| Resumo | `GET /admin/resumo` |
| Universidades | `GET /admin/universidades`, `GET/PUT /admin/universidades/:id`, `POST /admin/universidades`, `POST /admin/universidades/:id/situacao` (`acao`: `concluir`, `inconclusiva`, `reabrir`, `definir`), `POST /admin/universidades/:id/campi`, `POST /admin/universidades/:id/recalcular` |
| Iniciativas | `GET/POST /admin/iniciativas`, `GET/PUT /admin/iniciativas/:id`, `POST /admin/iniciativas/:id/status`, `POST/DELETE /admin/iniciativas/:id/evidencias[/:evid]`, `POST /admin/iniciativas/:id/relacoes`, `DELETE /admin/relacoes/:id` |
| Documentos e fontes | `GET/POST /admin/documentos`, `PUT /admin/documentos/:id`, `GET /admin/fontes`, `PUT /admin/fontes/:id` |
| Fila de revisão | `GET /admin/candidatos`, `GET /admin/candidatos/:id`, `POST /admin/candidatos/:id/{aprovar,rejeitar,inconclusivo,recoleta,vincular,verificar-trecho}` |
| Coleta | `GET /admin/coleta/status`, `POST /admin/coleta/execucoes` (`universidade_ids`, `modo`: `urls_manuais`/`busca_api`, `urls`), `GET /admin/coleta/execucoes[/:id]` |
| Duplicidades | `GET /admin/duplicidades?status=`, `POST /admin/duplicidades/:id/resolver` (`confirmar` + `manter_id` ou `descartar`) |
| Histórico | `GET /admin/historico?entidade=&registro_id=` |
| Tarefas | `GET /admin/tarefas`; `POST`/`PUT` somente `admin` |
| Relatos | `GET /admin/relatos`, `POST /admin/relatos/:id/status` |
| Usuários (`admin`) | `GET/POST /admin/usuarios`, `POST /admin/usuarios/:id/ativo` |
| Exportação | `GET /admin/exportar/base-completa.xlsx` (inclui não validados; exclui usuários) |

### Exemplo: aprovar com edições

```http
POST /api/admin/candidatos/56/aprovar
x-onismu-requisicao: 1
Content-Type: application/json

{ "edicoes": { "grau_evidencia": 2, "publicos": ["comunidade_universitaria"] }, "justificativa": "Conferido na fonte oficial" }
```
A evidência gravada é sempre a fonte e o trecho do candidato; a universidade não pode ser trocada na aprovação.
