# Publicação do ONISMU — passo a passo

Roteiro para colocar o ONISMU no ar, acessível ao público pela internet, a partir do código deste repositório.
Complementa [IMPLANTACAO.md](IMPLANTACAO.md) (variáveis, backups, rotina de manutenção).

**Arquitetura de produção:** um único servidor Linux com

```
Usuários ──HTTPS──▶ Caddy (443, certificado automático)
                      └─▶ Node.js (127.0.0.1:3001)  ── API /api/* + front-end compilado (web/dist)
                            └─▶ PostgreSQL 16 em Docker (127.0.0.1:5433)
```

O mesmo processo Node serve a API e a interface (com `NODE_ENV=production`), então basta **um domínio** e **uma porta pública**.

---

## Etapa 0 — Decisões antes de começar

| Decisão | Recomendação |
|---|---|
| Onde hospedar | **Servidor institucional da FURG** (solicitar ao NTI uma VM) ou VPS comercial (Hetzner, DigitalOcean, Contabo, Magalu Cloud etc.) |
| Tamanho da máquina | **2 vCPU, 4 GB RAM, 40 GB disco** bastam para a consulta pública. A coleta com Ollama (`qwen2.5:7b`) exige **+8 GB RAM** — ver Etapa 9 |
| Sistema | Ubuntu Server 24.04 LTS |
| Domínio | Ex.: `onismu.furg.br` (pedir ao NTI) ou domínio próprio (`onismu.org.br` no Registro.br) |
| Dados iniciais | Levar o **banco local** (preserva revisões já feitas) ou **reimportar** do zero — ver Etapa 6 |

> Atenção ao conteúdo público: hoje há **0 iniciativas validadas** — o site abrirá com painel e mapa vazios até a revisão
> humana dos 103 candidatos. Considere concluir parte da revisão antes de divulgar o endereço.

---

## Etapa 1 — Preparar o repositório (na sua máquina)

O repositório ainda não tem commits. Antes do primeiro:

1. Acrescente ao `.gitignore` itens locais que não devem ir para o servidor:
   ```
   logs/
   web/dist/
   ```
   (`.env`, `.admin-inicial.txt`, `backups/` e `infra/searxng/settings.yml` já estão ignorados.)
2. Confira que nenhum segredo será versionado: `git status` não deve listar `.env` nem `.admin-inicial.txt`.
3. Rode a verificação completa:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
4. Faça o commit e envie para um repositório **privado** no GitHub/GitLab:
   ```bash
   git add . && git commit -m "Versão inicial do ONISMU"
   git remote add origin git@github.com:SEU_USUARIO/onismu.git
   git push -u origin main
   ```

---

## Etapa 2 — Preparar o servidor

Acesse por SSH (`ssh usuario@IP_DO_SERVIDOR`) e execute:

```bash
# Atualizações e utilitários
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw

# Usuário de serviço sem privilégios (a aplicação roda com ele)
sudo adduser --disabled-password --gecos "" onismu

# Firewall: somente SSH, HTTP e HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable

# Node.js 24 (LTS)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Docker + Compose (para o PostgreSQL)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker onismu
```

Confira: `node -v` (≥ 20), `docker compose version`.

---

## Etapa 3 — Apontar o domínio

No DNS do domínio (NTI da FURG ou Registro.br), crie um registro **A** apontando `onismu.seudominio` para o IP público do servidor.
Verifique com `dig +short onismu.seudominio` — deve retornar o IP. A propagação pode levar de minutos a algumas horas.

---

## Etapa 4 — Baixar o código e configurar o `.env`

```bash
sudo -iu onismu
git clone git@github.com:SEU_USUARIO/onismu.git ~/onismu   # (cadastre uma deploy key SSH ou use HTTPS com token)
cd ~/onismu
cp .env.example .env
nano .env
```

Ajustes **obrigatórios** no `.env` de produção:

```ini
# Gere senhas fortes com: openssl rand -base64 24 | tr -d '/+='
POSTGRES_PASSWORD=SENHA_FORTE_AQUI
DATABASE_URL=postgres://onismu:SENHA_FORTE_AQUI@127.0.0.1:5433/onismu
TEST_DATABASE_URL=            # deixe vazio: testes não rodam em produção

NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://onismu.seudominio

# Coleta: sem Ollama no servidor, use regras determinísticas (ou "claude" com ANTHROPIC_API_KEY)
BUSCA_PROVEDOR=nenhum
EXTRATOR=heuristico
COLETA_CONTATO=seu-email-institucional@furg.br
COLETA_PERMITIR_REDE_PRIVADA=false
```

> A senha do Postgres é gravada **na primeira subida** do contêiner. Defina-a antes da Etapa 5; trocá-la depois exige `ALTER USER` no banco.

Proteja o arquivo: `chmod 600 .env`.

---

## Etapa 5 — Instalar, compilar e subir o banco

```bash
cd ~/onismu
npm ci                     # instala dependências (inclui tsx, usado pelos scripts de manutenção)
npm run build              # gera server/dist e web/dist
npm run db:up              # PostgreSQL em 127.0.0.1:5433 (não exposto à internet)
docker compose ps          # "db" deve aparecer como healthy
npm run migrate
```

> Não exporte `NODE_ENV=production` no shell antes do `npm ci` — isso faria o npm pular as dependências de desenvolvimento
> (`tsx`, `typescript`), necessárias para o build e os scripts. O `.env` é lido pela aplicação, não pelo npm.

---

## Etapa 6 — Carregar os dados

**Opção A — levar o banco local (recomendado se já houve revisões, usuários ou coletas):**

```bash
# Na sua máquina
npm run backup -w server                     # gera backups/onismu_AAAAMMDD_HHMMSS.dump
scp backups/onismu_*.dump onismu@IP_DO_SERVIDOR:~/

# No servidor
cd ~/onismu
docker compose exec -T db pg_restore -U onismu -d onismu --clean --if-exists --no-owner < ~/onismu_AAAAMMDD_HHMMSS.dump
```

Se os dados **fictícios** de demonstração estiverem no banco local, rode `npm run remover:demo -w server` antes do backup.

**Opção B — começar do zero:**

```bash
npm run importar:universo -w server
npm run importar:piloto -w server
```

Em ambos os casos, crie o administrador de produção (senha ≥ 12 caracteres, com letras e números):

```bash
npm run criar-admin -w server -- --email voce@furg.br --nome "Seu Nome" --papel admin
```

---

## Etapa 7 — Manter a aplicação no ar (systemd)

Saia do usuário `onismu` (`exit`) e crie `/etc/systemd/system/onismu.service`:

```ini
[Unit]
Description=ONISMU (API + interface)
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
User=onismu
WorkingDirectory=/home/onismu/onismu
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/dist/src/index.js
Restart=always
RestartSec=5
# Endurecimento básico
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now onismu
sudo systemctl status onismu                 # deve estar "active (running)"
curl http://127.0.0.1:3001/api/saude         # {"ok":true}
journalctl -u onismu -f                      # logs em tempo real
```

Use **uma única instância** (a fila de coleta roda dentro do processo). O contêiner do Postgres já sobe sozinho após reinício
se você acrescentar `restart: unless-stopped` ao serviço `db` do `docker-compose.yml`.

---

## Etapa 8 — HTTPS com Caddy

O cookie de sessão administrativa exige HTTPS em produção; o Caddy emite e renova o certificado (Let's Encrypt) sozinho.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
onismu.seudominio {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy
```

Abra `https://onismu.seudominio` no navegador. Teste: página inicial, mapa, catálogo, metodologia e login administrativo.

> No servidor da FURG, se o NTI já mantiver um proxy/Nginx com certificado institucional, peça apenas o encaminhamento
> de `onismu.furg.br` para a porta 3001 da VM (com o cabeçalho `X-Forwarded-Proto: https`) e pule esta etapa.

---

## Etapa 9 — Coleta automática (opcional)

A consulta pública não depende da coleta. Três caminhos:

1. **Continuar coletando localmente** (mais barato): rode SearXNG + Ollama no seu computador, revise e leve os resultados ao
   servidor por backup/restauração (Etapa 6A) ou por lotes JSON (`importar:piloto`).
2. **Coletar no servidor com Claude:** `EXTRATOR=claude` + `ANTHROPIC_API_KEY` no `.env` (custo por uso — ver [COLETA.md](COLETA.md)).
3. **Coletar no servidor com Ollama:** exige máquina com ≥ 12 GB RAM; instale o Ollama, `ollama pull qwen2.5:7b`,
   `docker compose up -d searxng` e defina `BUSCA_PROVEDOR=searxng`, `EXTRATOR=ollama`.

Após alterar o `.env`: `sudo systemctl restart onismu`. Diagnóstico: `npm run diagnosticar:coleta -w server`.

---

## Etapa 10 — Backups automáticos

Como usuário `onismu`, `crontab -e`:

```cron
# Backup diário às 3h; mantém 30 dias
0 3 * * * cd ~/onismu && npm run backup -w server >> ~/backup.log 2>&1
30 3 * * * find ~/onismu/backups -name 'onismu_*.dump' -mtime +30 -delete
```

Copie os backups para fora da máquina (armazenamento institucional, outro servidor, `rclone` para Google Drive/OneDrive)
e teste uma restauração por mês (ver [IMPLANTACAO.md](IMPLANTACAO.md#backups)).

---

## Etapa 11 — Atualizar a versão publicada

```bash
sudo -iu onismu
cd ~/onismu
npm run backup -w server        # sempre antes de atualizar
git pull
npm ci
npm run build
exit
sudo systemctl restart onismu   # migrações pendentes são aplicadas ao iniciar
```

---

## Lista de verificação antes de divulgar

- [ ] `https://` funciona e `http://` redireciona (o Caddy faz isso automaticamente)
- [ ] `POSTGRES_PASSWORD` trocada; porta 5433 **não** acessível de fora (`ufw status` mostra só 22, 80, 443)
- [ ] `.env` com `chmod 600`; `NODE_ENV=production`; `CORS_ORIGINS` com a URL pública
- [ ] Dados de demonstração removidos (`npm run remover:demo -w server`)
- [ ] Administrador criado; login e logout testados pelo domínio público
- [ ] Backup diário rodando e cópia externa configurada
- [ ] Iniciativas revisadas/validadas em número suficiente para a consulta pública fazer sentido
- [ ] Página de Metodologia revisada (deixa claro que não é ranking e que o mapeamento está em andamento)
- [ ] Contato para relatos de erro definido (`COLETA_CONTATO` e textos da interface)
