# Como rodar o ONISMU — passo a passo

Guia para colocar o projeto em funcionamento numa máquina de desenvolvimento (macOS, Linux ou Windows com WSL).

## 1. Pré-requisitos

| Ferramenta | Versão | Para quê |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 (testado no 24) | API e interface |
| [Docker](https://www.docker.com) + Docker Compose | recente | PostgreSQL 16 e SearXNG (busca) |
| [Git](https://git-scm.com) | qualquer | clonar o repositório |
| [Ollama](https://ollama.com) | opcional | extração local e gratuita na coleta automática |

Confira:

```bash
node -v
docker -v
docker compose version
```

> Sem Docker? Use um PostgreSQL 16 próprio e ajuste `DATABASE_URL` e `TEST_DATABASE_URL` no `.env`
> (crie também o banco `onismu_test`, ver `server/db-init/01-test-db.sql`).

## 2. Clonar o repositório

```bash
git clone https://github.com/Richard-SI/onismu.git
cd onismu
```

## 3. Configurar as variáveis de ambiente

```bash
cp .env.example .env
```

Os valores padrão já funcionam localmente — nenhuma chave é obrigatória. Principais variáveis:

- `DATABASE_URL` — banco principal (padrão: Postgres do Docker em `127.0.0.1:5433`).
- `TEST_DATABASE_URL` — banco usado **só** pelos testes (apagado a cada execução).
- `BUSCA_PROVEDOR` — `searxng` (local, gratuito), `brave` (pago) ou `nenhum`.
- `EXTRATOR` — `ollama` (local, gratuito), `claude` (pago, exige `ANTHROPIC_API_KEY`) ou `heuristico` (sem IA).

Se for usar o SearXNG (busca da coleta), crie também a configuração dele:

```bash
cp infra/searxng/settings.example.yml infra/searxng/settings.yml
# troque "TROQUE_POR_UM_SEGREDO_ALEATORIO" por um segredo, por exemplo:
openssl rand -hex 32
```

> `.env` e `infra/searxng/settings.yml` ficam fora do git — nunca os versione.

## 4. Instalar as dependências

```bash
npm install
```

Instala as dependências da raiz e dos dois workspaces (`server` e `web`).

## 5. Subir o banco de dados

```bash
npm run db:up
```

Sobe o PostgreSQL 16 em `127.0.0.1:5433` e cria automaticamente o banco de testes `onismu_test`.
Aguarde alguns segundos até o container ficar saudável (`docker ps` deve mostrar `onismu-db` como `healthy`).

## 6. Criar as tabelas (migrações)

```bash
npm run migrate
```

## 7. Carregar os dados

```bash
npm run importar:universo -w server   # 206 universidades (data/universo/universidades.csv)
npm run importar:piloto -w server     # lotes da pesquisa-piloto → candidatos pendentes de revisão
```

## 8. Criar um usuário administrador

```bash
npm run criar-admin -w server -- --email voce@instituicao.br --nome "Seu Nome" --papel admin
```

O comando pede a senha no terminal (ela não é exibida). Alternativamente, passe-a pela variável `ONISMU_SENHA`.
Use esse e-mail e senha para entrar na área administrativa. Rodar de novo com o mesmo e-mail redefine a senha.

## 9. Rodar o projeto

```bash
npm run dev
```

- Interface: <http://localhost:5173>
- API: <http://localhost:3001>

Para rodar separadamente: `npm run dev:server` e `npm run dev:web`.

## 10. (Opcional) Coleta automática gratuita

```bash
docker compose up -d searxng      # busca local em http://127.0.0.1:8888
ollama serve                      # se o Ollama não estiver rodando como serviço
ollama pull qwen2.5:7b            # modelo de extração (~4,7 GB)

npm run diagnosticar:coleta -w server        # verifica se busca e extrator respondem
npm run coletar -w server -- --sigla FURG    # coleta de uma universidade
```

A coleta também pode ser disparada pela tela **Coleta** da área administrativa. Todo candidato coletado
passa por **revisão humana obrigatória** antes de ficar público.

## 11. (Opcional) Outros comandos úteis

| Comando | O que faz |
|---|---|
| `npm test` | Testes do servidor e da interface (usa `onismu_test`, nunca o banco principal) |
| `npm run typecheck` | Checagem de tipos TypeScript |
| `npm run build` | Build de produção (servidor e interface) |
| `npm run verificar:trechos -w server` | Reconfere os trechos comprobatórios na fonte original |
| `npm run seed:demo -w server` | Carrega dados **fictícios** para conhecer a interface |
| `npm run remover:demo -w server` | Remove os dados fictícios |
| `npm run backup -w server` | Gera backup do banco |
| `npm run db:down` | Para os containers (os dados persistem no volume `onismu_pgdata`) |

## 12. Problemas comuns

- **`ECONNREFUSED 127.0.0.1:5433`** — o banco não está rodando: `npm run db:up` e confira `docker ps`.
- **Porta 5433, 3001 ou 5173 ocupada** — encerre o processo que a usa ou altere a porta (`PORT` no `.env`; `ports` no `docker-compose.yml`).
- **SearXNG não sobe** — verifique se `infra/searxng/settings.yml` existe (passo 3).
- **Coleta sem resultados / CAPTCHA** — os motores de busca limitam volume; espace as coletas (`BUSCA_INTERVALO_MS`).
- **Ollama não responde** — rode `ollama serve` e confirme o modelo com `ollama list`.
- **Recomeçar o banco do zero** — `docker compose down -v` (apaga o volume!) e repita os passos 5 a 8.

## Mais documentação

- Publicação em servidor (domínio, HTTPS, systemd): [docs/PUBLICACAO.md](docs/PUBLICACAO.md)
- Implantação, variáveis e backups: [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md)
- Coleta assistida em detalhe: [docs/COLETA.md](docs/COLETA.md)
- Arquitetura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md)
