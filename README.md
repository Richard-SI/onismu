# ONISMU — Observatório Nacional de Iniciativas de Saúde Mental nas Universidades Brasileiras

Plataforma pública de pesquisa e consulta que **mapeia, classifica, verifica, visualiza e compara** iniciativas de cuidado à saúde
mental desenvolvidas por universidades brasileiras — políticas institucionais, serviços permanentes, projetos de extensão,
ações pontuais e iniciativas de pesquisa e formação — sempre com **fonte original e trecho comprobatório**.

- Consulta pública aberta, sem login (painel, mapa, catálogo, páginas de detalhe, comparador, comparação temática, metodologia, exportações).
- Área administrativa autenticada: fila de revisão da coleta, cadastro/edição, duplicidades, histórico, tarefas, usuários e exportação da base.
- Coleta assistida: busca (plugável), download seguro, extração (IA Claude ou regras determinísticas), validação anti-alucinação e **revisão humana obrigatória**.
- Não é um ranking de qualidade. “Nenhuma iniciativa localizada” ≠ “não possui iniciativas”.

> Contexto: o projeto nasce em diálogo com a pesquisa *“Qual o preço a se pagar pela dor?” — uma análise das políticas de saúde mental
> nas universidades federais do Rio Grande do Sul*, cujo campo empírico (UFRGS, UFPel, FURG, UFCSPA, Unipampa, UFSM, UFFS) compôs a pesquisa-piloto.

## Estado atual (22/10/2026)

| Item | Situação |
|---|---|
| Universo institucional | **206 universidades** (INEP, Censo da Educação Superior 2024) — todas com registro de acompanhamento |
| Pesquisa-piloto | **14 universidades** (5 regiões; federais, estaduais e privada comunitária) → **103 candidatos** com fonte e trecho |
| Verificação automática dos trechos | 98 confirmados literalmente na fonte · 2 não localizados · 3 fontes inacessíveis na conferência |
| Iniciativas **validadas** (públicas) | **0** — os 103 candidatos aguardam revisão humana na fila administrativa |
| Cobertura nacional | 0% concluída; 14 aguardando validação; 192 não pesquisadas |
| Coleta automática | **Gratuita e local**: busca SearXNG (Docker) + modelo `qwen2.5:7b` (Ollama). Testada em coletas reais da FURG (10 candidatos pendentes) |
| Testes | 52 (servidor) + 5 (interface) passando |

O mapeamento nacional **não está concluído**. Ver [docs/PILOTO.md](docs/PILOTO.md) e [docs/PENDENCIAS.md](docs/PENDENCIAS.md).

## Execução local

Passo a passo completo: [COMO_RODAR.md](COMO_RODAR.md).

Requisitos: Node.js ≥ 20 (testado no 24), Docker (com Docker Compose) — ou um PostgreSQL 16 próprio.

```bash
cd onismu
cp .env.example .env            # ajuste se necessário (nenhuma chave é obrigatória)
npm install
npm run db:up                   # PostgreSQL 16 em 127.0.0.1:5433 (cria também o banco de testes)
npm run migrate                 # aplica as migrações versionadas
npm run importar:universo -w server   # 206 universidades (data/universo/universidades.csv)
npm run importar:piloto -w server     # lotes de data/piloto/*.json → candidatos pendentes
npm run criar-admin -w server -- --email voce@instituicao.br --nome "Seu Nome" --papel admin
npm run dev                     # API em :3001 e interface em http://localhost:5173
```

Coleta automática gratuita (opcional): `docker compose up -d searxng`, `ollama serve` e `ollama pull qwen2.5:7b`; confira com
`npm run diagnosticar:coleta -w server` e colete com `npm run coletar -w server -- --sigla FURG` ou pela tela “Coleta”.

Opcional: `npm run verificar:trechos -w server` (reconfere os trechos na fonte original) e `npm run seed:demo -w server`
(dados **fictícios** para conhecer a interface; ocultos por padrão, sinalizados em todas as telas; remova com `npm run remover:demo -w server`).

Testes: `npm test` (o servidor usa o banco `onismu_test`, que é recriado a cada execução — nunca o banco principal).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Stack, módulos, modelo de dados, decisões técnicas |
| [docs/API.md](docs/API.md) | Rotas públicas e administrativas |
| [docs/COLETA.md](docs/COLETA.md) | Coleta assistida, integrações (busca, Claude), custos, segurança |
| [docs/PROTOCOLO_PESQUISA.md](docs/PROTOCOLO_PESQUISA.md) | Protocolo de pesquisa, taxonomia, evidência, revisão |
| [docs/PILOTO.md](docs/PILOTO.md) | Pesquisa-piloto: resultados, matriz de cobertura, dados verificados |
| [docs/MODELO_IMPORTACAO.md](docs/MODELO_IMPORTACAO.md) | Formatos de importação (universo e lotes de pesquisa) |
| [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md) | Implantação, variáveis de ambiente, backups, manutenção |
| [docs/PUBLICACAO.md](docs/PUBLICACAO.md) | Passo a passo para publicar o site (servidor, domínio, HTTPS, systemd) |
| [docs/PENDENCIAS.md](docs/PENDENCIAS.md) | Entregas por etapa, limitações e próximos passos |
