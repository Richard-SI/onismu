# Entregas, limitações e pendências

## Registro por etapa

| Etapa | Entregue | Verificação |
|---|---|---|
| A — Diagnóstico | Pasta continha apenas `projetoSM.docx` (projeto de pesquisa sobre as federais do RS). Sem código prévio: stack preferencial adotada. Docker (Colima) iniciado; nenhuma chave de API no ambiente | — |
| B — Plano | Arquitetura e decisões em [ARQUITETURA.md](ARQUITETURA.md) | — |
| C — Banco e back-end | Migração `001_esquema_inicial.sql` (19 tabelas, `pg_trgm`/`unaccent`), API pública e administrativa, validação Zod, paginação, filtros, autorização | Testes de registros, segurança e indicadores |
| D — Front-end | Início, painel, mapa (malha IBGE) + tabela, catálogo, universidades, detalhes, comparador, comparação temática, metodologia; tema claro/escuro; responsivo | Capturas em navegador real (Chrome headless) + 5 testes de interface |
| E — Administração | Login, fila de revisão (6 decisões), coleta, registros, documentos/fontes, duplicidades, histórico, relatos, tarefas, exportação, usuários | Testes de fluxo e de bloqueio |
| F — Coleta assistida | Busca plugável (Brave), URLs informadas, fetch seguro, extração Claude (schema) ou heurística, validação anti-alucinação, fila, reverificação | Testes com servidor HTTP local, SSRF, robots, falhas, extrator IA com cliente simulado |
| G — Indicadores e exportações | Fórmulas com numerador/denominador; CSV/XLSX filtrados; PDF; base completa | Testes de consistência gráfico × banco e de exportação |
| H — Testes | **52 testes do servidor + 5 da interface passando** (`npm test`) | Ver abaixo |
| I — Piloto | 14 universidades, 103 candidatos reais, 98 trechos confirmados na fonte | [PILOTO.md](PILOTO.md) |
| J — Expansão nacional | **Não iniciada** — depende da revisão do piloto e de um provedor de busca ou de lotes manuais | — |
| K — Implantação | [IMPLANTACAO.md](IMPLANTACAO.md), `.env.example`, Docker Compose, backup | Build de produção e servidor de produção testados localmente |

Correções feitas durante a verificação: contorno de SSRF por IP literal (o lookup de DNS não é chamado para IPs; agora validado explicitamente), promessa não resolvida quando o servidor remoto encerra a conexão no meio da resposta (afetou a 1ª reverificação), duplicação do React no workspace, orientação dos polígonos da malha do IBGE, escolha de trecho do extrator heurístico.

## Testes (cobertura dos 18 itens exigidos)

| # | Item | Arquivo |
|---|---|---|
| 1–3 | Universidades, iniciativas, relação universidade–iniciativa–fonte | `server/test/registros.test.ts` |
| 4 | Validação de categorias | `registros.test.ts` |
| 5, 18 | Cálculo dos indicadores; consistência gráficos × banco | `indicadores.test.ts` |
| 6 | Filtros e paginação | `registros.test.ts` |
| 7 | Comparação | `indicadores.test.ts` |
| 8 | Exportação (CSV/XLSX/PDF, CSV injection) | `revisao.test.ts` |
| 9 | Duplicidades | `revisao.test.ts` |
| 10 | Aprovação/rejeição/inconclusivo/recoleta/vínculo | `revisao.test.ts` |
| 11–13 | Autenticação, bloqueio, ausência de vazamento | `seguranca.test.ts` |
| 14–15 | URLs inválidas, SSRF, falhas de coleta | `coleta.test.ts` |
| 16 | Dados demonstrativos × reais | `indicadores.test.ts` |
| 17 | Estados de pesquisa não concluída | `registros.test.ts`, `coleta.test.ts` |
| — | Fluxo completo fonte → candidato → revisão → aprovação → catálogo | `coleta.test.ts` |
| — | Extrator IA (isolamento do conteúdo, recusa, schema) | `extrator-ia.test.ts` |
| — | Modelo local (Ollama), busca local (SearXNG), priorização de fontes | `integracoes-locais.test.ts` |

## Limitações conhecidas

- **Cobertura:** 0 universidades com pesquisa concluída; o piloto aguarda revisão humana. Os indicadores públicos estão zerados por desenho, não por falha.
- **Coleta automática local** (SearXNG + `qwen2.5:7b`): sem custo, mas ~1 min por página e classificação menos precisa que a de modelos maiores; os motores públicos limitam volume (CAPTCHA/“too many requests”). Claude e Brave continuam disponíveis como opções pagas.
- **Universo:** Censo 2024 (instituições criadas/reclassificadas depois não constam); sites oficiais ausentes da base do INEP (domínios preenchidos só para as 14 do piloto); universidades multicampi sob o município da sede.
- **Formatos:** o coletor lê HTML, PDF e texto; DOC/ODT e páginas que dependem de JavaScript não são lidas (ficam como erro/pendência).
- **Fila em processo:** uma instância por implantação; coletas interrompidas por reinício precisam ser reexecutadas.
- **Pacote do front-end:** ~212 kB gzip (biblioteca de gráficos); a administração já é carregada sob demanda.
- **Evolução temporal:** o painel mostra tabela até haver histórico de vários meses.
- **Revisão em lote** não implementada (decisões são individuais, por desenho).

## Próximos passos

1. Conferir a revisão assistida por IA da FURG e da UFRGS (24 iniciativas) e declarar a pesquisa concluída; revisar os 84 candidatos das outras 12 universidades quando o piloto for ampliado ([PILOTO.md](PILOTO.md)).
2. Declarar a situação final das 14 universidades (concluída ou inconclusiva).
3. Trocar a senha da conta administrativa inicial (arquivo local `.admin-inicial.txt`, fora do git) e apagar o arquivo; criar contas da equipe.
4. Remover os dados demonstrativos antes de publicar: `npm run remover:demo -w server`.
5. Expandir por região com a coleta local (tarefas agendadas espaçadas), começando pelas universidades públicas do Sul e Sudeste; preencher `dominio` antes, pois as consultas `site:` rendem muito mais. Se houver créditos, `EXTRATOR=claude` melhora a classificação.
6. Preencher `site_oficial`/`dominio` das 192 universidades restantes a partir de fonte oficial (e-MEC), sem inferência.
7. Implantar com HTTPS e backup diário; agendar `coleta:agendada` e a reverificação periódica de fontes.
8. Avaliar: leitura de DOC/ODT; renderização de páginas com JavaScript; revisão por pares (dupla validação); ampliação para centros universitários e IFs.
