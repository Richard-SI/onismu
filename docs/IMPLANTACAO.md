# Implantação, operação e manutenção

## Variáveis de ambiente (`.env`, modelo em `.env.example`)

| Variável | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL principal |
| `TEST_DATABASE_URL` | Banco exclusivo de testes (nome deve conter “test”; é apagado a cada execução) |
| `NODE_ENV` | `production` ativa cookie `Secure`, `trust proxy` e o servimento do front-end compilado |
| `PORT` | Porta da API (padrão 3001) |
| `CORS_ORIGINS` | Origens permitidas (em produção com mesmo domínio, use a própria URL pública) |
| `SESSAO_HORAS` | Validade da sessão administrativa |
| `BUSCA_PROVEDOR`, `SEARXNG_URL`, `BUSCA_INTERVALO_MS`, `BRAVE_API_KEY` | Busca automática (`searxng` local ou `brave`) — ver [COLETA.md](COLETA.md) |
| `EXTRATOR`, `OLLAMA_URL`, `OLLAMA_MODELO`, `OLLAMA_CONTEXTO`, `OLLAMA_TIMEOUT_MS` | Extração com modelo local (`ollama`) |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODELO` | Extração com Claude (`EXTRATOR=claude`) |
| `COLETA_*` | Limites da coleta e contato no User-Agent |
| `COLETA_PERMITIR_REDE_PRIVADA` | **Somente testes**; a aplicação recusa iniciar com ela em produção |

Segredos ficam apenas no `.env` (fora do git) ou no gerenciador de segredos da hospedagem; não são registrados em logs.

## Produção (servidor único)

```bash
npm ci
npm run build                      # compila server/dist e web/dist
NODE_ENV=production npm run migrate
NODE_ENV=production node server/dist/src/index.js
```
Coloque um proxy reverso com HTTPS (Nginx, Caddy) na frente da porta da API — o cookie de sessão exige HTTPS em produção.
O processo aplica migrações pendentes ao iniciar e marca coletas interrompidas. Use um gerenciador de processos (systemd, pm2)
e uma única instância (a fila de coleta é em processo).

Primeiro acesso: `npm run criar-admin -w server -- --email … --nome "…" --papel admin` (senha digitada ou via `ONISMU_SENHA`; ≥ 12 caracteres com letras e números).

## Backups

- `npm run backup -w server` → `backups/onismu_AAAAMMDD_HHMMSS.dump` (`pg_dump -Fc` no contêiner do Compose).
- Restauração: `docker compose exec -T db pg_restore -U onismu -d onismu --clean < backups/arquivo.dump`.
- Recomendado: cron diário + cópia externa (outra máquina ou armazenamento institucional), retenção de 30 dias e teste de restauração mensal.
- Sem Docker: `pg_dump "$DATABASE_URL" -Fc -f backup.dump`.

## Rotina de atualização dos dados

1. Reimportar o universo quando o INEP publicar novo Censo (`importar:universo`), registrando o ano em `data/universo/FONTE.md`.
2. Coletas: pela tela “Coleta” (URLs ou busca) ou tarefas agendadas (`npm run coleta:agendada -w server` no cron).
3. Revisar a fila; verificar trechos não confirmados; resolver duplicidades; declarar conclusão por universidade.
4. Acompanhar relatos de erro e registrar correções (o histórico guarda o antes/depois).
5. Exportar a base completa periodicamente para arquivo da pesquisa.

## Migrações

Novas alterações de esquema: criar `server/migrations/002_descricao.sql` (nunca editar uma migração já aplicada em produção) e rodar `npm run migrate`.
A taxonomia pode ser ajustada por migração (inserir/desativar categorias) sem reestruturar a aplicação.

## Segurança implementada

Autenticação por sessão revogável, senhas com scrypt, autorização no servidor por papel, cabeçalho anti-CSRF + `SameSite=Strict`,
CSP e cabeçalhos do helmet, CORS restrito, limites de taxa (geral, login, relatos), validação por schema em todas as entradas,
SQL parametrizado, React escapando conteúdo (sem `dangerouslySetInnerHTML`), proteção contra CSV injection, proteção SSRF na coleta,
logs sem corpo de requisição, rotas públicas sem acesso a candidatos, usuários ou logs detalhados.
