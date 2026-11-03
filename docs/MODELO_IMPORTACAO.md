# Modelos de importação

## 1. Universo institucional — CSV

Arquivo padrão: `data/universo/universidades.csv` (UTF-8, vírgula, cabeçalho). Modelo: `data/modelos/universidades_modelo.csv`.

| Coluna | Obrigatória | Regra |
|---|---|---|
| `codigo_emec` | sim | Código institucional e-MEC/INEP (inteiro). Chave de atualização (reimportar atualiza, não duplica) |
| `nome_oficial` | sim | Nome conforme a fonte (a caixa é normalizada na importação) |
| `sigla` | não | |
| `categoria_administrativa` | sim | `publica_federal`, `publica_estadual`, `publica_municipal`, `privada_sem_fins_lucrativos`, `privada_com_fins_lucrativos`, `especial` |
| `organizacao_academica` | sim | Deve ser `Universidade` (outras linhas são rejeitadas) |
| `uf` | sim | Sigla da UF; a região é derivada |
| `municipio` | não | Município da sede |
| `site_oficial` | não | Somente se constar na fonte — não inferir |
| `fonte` | sim | Conjunto de dados + URL |
| `ano_referencia` | não | |
| `subcategoria` | não | ex.: comunitária, confessional |

Comando: `npm run importar:universo -w server [-- --arquivo caminho.csv]`. A situação de pesquisa nunca é sobrescrita; alterações vão ao histórico.

## 2. Lotes de pesquisa — JSON

Modelo: `data/modelos/lote_modelo.json`. Usado para pesquisa manual da equipe, levantamentos externos ou assistidos por IA.
Todos os candidatos entram como **pendentes de revisão**; nada é publicado pela importação.

Campos por universidade: `sigla`, `nome_oficial` (localização no universo), `dominio`, `consultas`, `fontes_consultadas[]`
(`url`, `titulo`, `acessada`, `observacao`), `resultado` (`com_iniciativas`/`sem_iniciativas`/`inconclusiva`), `pendencias`, `candidatos[]`.

Campos por candidato: `nome`, `categoria_sugerida` (código da taxonomia), `categorias_secundarias`, `descricao`, `objetivos`, `publico_alvo`,
`modalidade`, `abrangencia`, `situacao_aparente`, `periodo`, `unidade_responsavel`, `campus`, `documento_relacionado`
(`titulo`, `tipo_documento`, `numero_documento`, `data_publicacao`, `orgao_emissor`, `url_original`), `url_fonte`, `titulo_fonte`,
`tipo_fonte`, `data_publicacao_fonte`, `trecho_evidencia` (**literal**), `grau_evidencia_sugerido` (1–4), `confianca`, `campos_ausentes`, `justificativa`.
Use `null` para informação ausente — nunca estime.

Comandos:
```bash
npm run importar:piloto -w server -- data/piloto/meu_lote.json   # idempotente por PILOTO-<LOTE>-<SIGLA>
npm run verificar:trechos -w server                               # confere cada trecho na fonte
```
Candidatos inválidos (URL, categoria, trecho curto) são rejeitados e listados no terminal e nos erros da execução.
