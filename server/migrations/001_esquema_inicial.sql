-- ONISMU — esquema inicial
-- Convenções: nomes em português, snake_case; datas em timestamptz; enumerações
-- controladas por CHECK (alteráveis em migrações futuras) e taxonomia em tabelas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() não é IMMUTABLE; este invólucro permite uso em índices.
CREATE OR REPLACE FUNCTION f_normalizar(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(texto, ''))) $$;

CREATE OR REPLACE FUNCTION f_tocar_updated_at() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------------
-- Usuários administrativos e sessões
-- ---------------------------------------------------------------------------
CREATE TABLE usuarios (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email) AND position('@' in email) > 1),
  nome          text NOT NULL,
  senha_hash    text NOT NULL,
  papel         text NOT NULL CHECK (papel IN ('admin', 'pesquisador')),
  ativo         boolean NOT NULL DEFAULT true,
  ultimo_login  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_usuarios_upd BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION f_tocar_updated_at();

CREATE TABLE sessoes (
  token_hash  text PRIMARY KEY,           -- SHA-256 do token; o token em si só existe no cookie
  usuario_id  integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criada_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL
);
CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id);

-- ---------------------------------------------------------------------------
-- Universidades, campi
-- ---------------------------------------------------------------------------
CREATE TABLE universidades (
  id                       serial PRIMARY KEY,
  nome_oficial             text NOT NULL,
  sigla                    text,
  codigo_institucional     integer UNIQUE,            -- código e-MEC / INEP (CO_IES)
  categoria_administrativa text NOT NULL CHECK (categoria_administrativa IN (
                             'publica_federal', 'publica_estadual', 'publica_municipal',
                             'privada_sem_fins_lucrativos', 'privada_com_fins_lucrativos', 'especial')),
  subcategoria             text,                       -- ex.: comunitária, confessional (quando a fonte informa)
  organizacao_academica    text NOT NULL DEFAULT 'universidade',
  regiao                   text NOT NULL CHECK (regiao IN ('Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul')),
  estado                   char(2) NOT NULL CHECK (estado ~ '^[A-Z]{2}$'),
  municipio                text,
  site_oficial             text,
  dominio                  text,
  situacao_pesquisa        text NOT NULL DEFAULT 'nao_pesquisada' CHECK (situacao_pesquisa IN (
                             'nao_pesquisada', 'em_pesquisa', 'concluida_com_iniciativas',
                             'concluida_sem_iniciativas', 'inconclusiva', 'aguardando_validacao')),
  data_ultima_verificacao  timestamptz,
  fonte_cadastro           text,                       -- fonte oficial que identificou a instituição
  ano_referencia_cadastro  integer,
  origem_dados             text NOT NULL DEFAULT 'real' CHECK (origem_dados IN ('real', 'demonstrativo')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_universidades_upd BEFORE UPDATE ON universidades FOR EACH ROW EXECUTE FUNCTION f_tocar_updated_at();
CREATE INDEX idx_univ_estado ON universidades(estado);
CREATE INDEX idx_univ_regiao ON universidades(regiao);
CREATE INDEX idx_univ_situacao ON universidades(situacao_pesquisa);
CREATE INDEX idx_univ_categoria ON universidades(categoria_administrativa);
CREATE INDEX idx_univ_nome_trgm ON universidades USING gin (f_normalizar(nome_oficial) gin_trgm_ops);

CREATE TABLE campi (
  id               serial PRIMARY KEY,
  universidade_id  integer NOT NULL REFERENCES universidades(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  municipio        text,
  estado           char(2) CHECK (estado ~ '^[A-Z]{2}$'),
  descricao        text,
  UNIQUE (universidade_id, nome)
);

-- ---------------------------------------------------------------------------
-- Taxonomia controlada
-- ---------------------------------------------------------------------------
CREATE TABLE categorias (
  id         serial PRIMARY KEY,
  codigo     text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z_]+$'),
  nome       text NOT NULL,
  descricao  text NOT NULL,
  inclui     text,          -- exemplos do que entra na categoria
  ordem      integer NOT NULL DEFAULT 0,
  ativa      boolean NOT NULL DEFAULT true
);

CREATE TABLE publicos_alvo (
  id      serial PRIMARY KEY,
  codigo  text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z_]+$'),
  nome    text NOT NULL,
  ordem   integer NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Iniciativas
-- ---------------------------------------------------------------------------
CREATE TABLE iniciativas (
  id                      serial PRIMARY KEY,
  nome                    text NOT NULL CHECK (length(trim(nome)) > 2),
  slug                    text NOT NULL UNIQUE,
  descricao               text,
  objetivos               text,
  universidade_id         integer NOT NULL REFERENCES universidades(id) ON DELETE RESTRICT,
  campus_id               integer REFERENCES campi(id) ON DELETE SET NULL,
  unidade_responsavel     text,
  categoria_principal_id  integer NOT NULL REFERENCES categorias(id),
  modalidade              text CHECK (modalidade IN ('presencial', 'online', 'hibrida')),
  abrangencia             text CHECK (abrangencia IN ('institucional', 'campus', 'unidade', 'externa')),
  data_inicio             date,
  data_fim                date,
  situacao_documentada    text NOT NULL DEFAULT 'desconhecida' CHECK (situacao_documentada IN ('ativa', 'encerrada', 'desconhecida')),
  periodicidade           text CHECK (periodicidade IN ('permanente', 'periodica', 'pontual', 'desconhecida')),
  grau_evidencia          smallint NOT NULL DEFAULT 4 CHECK (grau_evidencia BETWEEN 1 AND 4),
  status_validacao        text NOT NULL DEFAULT 'pendente' CHECK (status_validacao IN ('pendente', 'validada', 'rejeitada', 'inconclusiva', 'arquivada')),
  limitacoes              text,
  data_ultima_evidencia   date,
  data_ultima_verificacao timestamptz,
  validado_por            integer REFERENCES usuarios(id),
  validado_em             timestamptz,
  origem_dados            text NOT NULL DEFAULT 'real' CHECK (origem_dados IN ('real', 'demonstrativo')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
);
CREATE TRIGGER trg_iniciativas_upd BEFORE UPDATE ON iniciativas FOR EACH ROW EXECUTE FUNCTION f_tocar_updated_at();
CREATE INDEX idx_inic_univ ON iniciativas(universidade_id);
CREATE INDEX idx_inic_cat ON iniciativas(categoria_principal_id);
CREATE INDEX idx_inic_status ON iniciativas(status_validacao);
CREATE INDEX idx_inic_grau ON iniciativas(grau_evidencia);
CREATE INDEX idx_inic_nome_trgm ON iniciativas USING gin (f_normalizar(nome) gin_trgm_ops);

CREATE TABLE iniciativa_categorias_secundarias (
  iniciativa_id  integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  categoria_id   integer NOT NULL REFERENCES categorias(id),
  PRIMARY KEY (iniciativa_id, categoria_id)
);

CREATE TABLE iniciativa_publicos (
  iniciativa_id    integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  publico_alvo_id  integer NOT NULL REFERENCES publicos_alvo(id),
  PRIMARY KEY (iniciativa_id, publico_alvo_id)
);
CREATE INDEX idx_inic_pub_publico ON iniciativa_publicos(publico_alvo_id);

-- Relações entre iniciativas (ex.: projeto vinculado a uma política) — não duplicam contagem.
CREATE TABLE iniciativa_relacoes (
  id          serial PRIMARY KEY,
  origem_id   integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  destino_id  integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('vinculada_a_politica', 'parte_de', 'relacionada', 'duplicata_de')),
  observacao  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origem_id, destino_id, tipo),
  CHECK (origem_id <> destino_id)
);

-- ---------------------------------------------------------------------------
-- Documentos, fontes e evidências
-- ---------------------------------------------------------------------------
CREATE TABLE documentos (
  id                serial PRIMARY KEY,
  titulo            text NOT NULL,
  tipo_documento    text NOT NULL CHECK (tipo_documento IN ('resolucao', 'portaria', 'instrucao_normativa', 'plano', 'politica', 'relatorio', 'edital', 'regimento', 'outro')),
  numero_documento  text,
  data_publicacao   date,
  orgao_emissor     text,
  url_original      text,
  url_normalizada   text,
  descricao         text,
  universidade_id   integer NOT NULL REFERENCES universidades(id) ON DELETE CASCADE,
  origem_dados      text NOT NULL DEFAULT 'real' CHECK (origem_dados IN ('real', 'demonstrativo')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_documentos_upd BEFORE UPDATE ON documentos FOR EACH ROW EXECUTE FUNCTION f_tocar_updated_at();
CREATE INDEX idx_doc_univ ON documentos(universidade_id);
CREATE UNIQUE INDEX uq_doc_url ON documentos(universidade_id, url_normalizada) WHERE url_normalizada IS NOT NULL;

CREATE TABLE iniciativa_documentos (
  iniciativa_id  integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  documento_id   integer NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  PRIMARY KEY (iniciativa_id, documento_id)
);

CREATE TABLE fontes (
  id               serial PRIMARY KEY,
  url_original     text NOT NULL,
  url_canonica     text NOT NULL UNIQUE,       -- URL normalizada (chave de deduplicação)
  titulo           text,
  tipo_fonte       text NOT NULL CHECK (tipo_fonte IN ('site_institucional', 'documento_normativo', 'noticia_oficial', 'sistema_extensao',
                                                      'relatorio_institucional', 'repositorio', 'publicacao_cientifica', 'fonte_secundaria')),
  data_publicacao  date,
  data_consulta    timestamptz NOT NULL,
  situacao_fonte   text NOT NULL DEFAULT 'acessivel' CHECK (situacao_fonte IN ('acessivel', 'indisponivel', 'alterada', 'nao_verificada')),
  observacoes      text,
  universidade_id  integer REFERENCES universidades(id) ON DELETE SET NULL,
  origem_dados     text NOT NULL DEFAULT 'real' CHECK (origem_dados IN ('real', 'demonstrativo')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_fontes_upd BEFORE UPDATE ON fontes FOR EACH ROW EXECUTE FUNCTION f_tocar_updated_at();
CREATE INDEX idx_fontes_univ ON fontes(universidade_id);

-- Evidência = trecho de uma fonte que fundamenta uma iniciativa (N:N com conteúdo próprio).
CREATE TABLE evidencias (
  id                serial PRIMARY KEY,
  iniciativa_id     integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  fonte_id          integer NOT NULL REFERENCES fontes(id) ON DELETE RESTRICT,
  trecho_evidencia  text NOT NULL CHECK (length(trim(trecho_evidencia)) > 0),
  data_consulta     timestamptz NOT NULL,
  verificacao_trecho text NOT NULL DEFAULT 'nao_verificado' CHECK (verificacao_trecho IN ('confirmado', 'nao_localizado', 'nao_verificado', 'erro_acesso')),
  criado_por        integer REFERENCES usuarios(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (iniciativa_id, fonte_id, trecho_evidencia)
);
CREATE INDEX idx_evid_fonte ON evidencias(fonte_id);

-- ---------------------------------------------------------------------------
-- Coleta assistida: execuções, páginas examinadas, candidatos
-- ---------------------------------------------------------------------------
CREATE TABLE coleta_execucoes (
  id                      serial PRIMARY KEY,
  identificador           text NOT NULL UNIQUE,       -- identificador legível da execução
  universidade_id         integer NOT NULL REFERENCES universidades(id) ON DELETE CASCADE,
  modo                    text NOT NULL CHECK (modo IN ('busca_api', 'urls_manuais', 'importacao_piloto')),
  ferramenta              text NOT NULL,              -- provedor de busca + extrator utilizados
  status                  text NOT NULL DEFAULT 'na_fila' CHECK (status IN ('na_fila', 'em_andamento', 'concluida', 'parcial', 'falhou', 'interrompida')),
  termos_busca            text[] NOT NULL DEFAULT '{}',
  urls_informadas         text[] NOT NULL DEFAULT '{}',
  paginas_examinadas      integer NOT NULL DEFAULT 0,
  candidatos_encontrados  integer NOT NULL DEFAULT 0,
  erros                   jsonb NOT NULL DEFAULT '[]',
  pendencias              text[] NOT NULL DEFAULT '{}',
  resultado_declarado     text CHECK (resultado_declarado IN ('com_iniciativas', 'sem_iniciativas', 'inconclusiva')),
  iniciada_por            integer REFERENCES usuarios(id),
  iniciada_em             timestamptz NOT NULL DEFAULT now(),
  finalizada_em           timestamptz,
  observacoes             text
);
CREATE INDEX idx_exec_univ ON coleta_execucoes(universidade_id);
CREATE INDEX idx_exec_status ON coleta_execucoes(status);

CREATE TABLE coleta_paginas (
  id             serial PRIMARY KEY,
  execucao_id    integer NOT NULL REFERENCES coleta_execucoes(id) ON DELETE CASCADE,
  url            text NOT NULL,
  url_final      text,
  titulo         text,
  origem         text NOT NULL DEFAULT 'busca' CHECK (origem IN ('busca', 'manual', 'piloto')),
  consulta       text,                                -- termo de busca que levou à página
  status         text NOT NULL CHECK (status IN ('relevante', 'sem_termos', 'erro', 'bloqueada', 'ignorada', 'consultada')),
  http_status    integer,
  content_type   text,
  bytes          integer,
  erro           text,
  observacao     text,
  consultada_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pag_exec ON coleta_paginas(execucao_id);

CREATE TABLE candidatos (
  id                        serial PRIMARY KEY,
  execucao_id               integer NOT NULL REFERENCES coleta_execucoes(id) ON DELETE CASCADE,
  universidade_id           integer NOT NULL REFERENCES universidades(id) ON DELETE CASCADE,
  pagina_id                 integer REFERENCES coleta_paginas(id) ON DELETE SET NULL,
  extrator                  text NOT NULL,             -- 'ia:<modelo>', 'heuristico', 'piloto:<ferramenta>'
  dados                     jsonb NOT NULL,            -- extração estruturada validada por schema
  nome                      text NOT NULL,
  categoria_sugerida        text NOT NULL REFERENCES categorias(codigo),
  url_fonte                 text NOT NULL,
  titulo_fonte              text,
  tipo_fonte                text NOT NULL,
  trecho_evidencia          text NOT NULL,
  grau_evidencia_sugerido   smallint NOT NULL CHECK (grau_evidencia_sugerido BETWEEN 1 AND 4),
  confianca                 text NOT NULL CHECK (confianca IN ('alta', 'media', 'baixa')),
  campos_ausentes           text[] NOT NULL DEFAULT '{}',
  justificativa             text,
  verificacao_trecho        text NOT NULL DEFAULT 'nao_verificado' CHECK (verificacao_trecho IN ('confirmado', 'nao_localizado', 'nao_verificado', 'erro_acesso')),
  verificacao_detalhe       text,
  possiveis_duplicatas      jsonb NOT NULL DEFAULT '[]',
  status                    text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'inconclusivo', 'recoleta_solicitada', 'vinculado')),
  iniciativa_id             integer REFERENCES iniciativas(id) ON DELETE SET NULL,
  decidido_por              integer REFERENCES usuarios(id),
  decidido_em               timestamptz,
  motivo_decisao            text,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cand_status ON candidatos(status);
CREATE INDEX idx_cand_univ ON candidatos(universidade_id);
CREATE INDEX idx_cand_exec ON candidatos(execucao_id);

-- ---------------------------------------------------------------------------
-- Duplicidades, histórico, tarefas, relatos de erro
-- ---------------------------------------------------------------------------
CREATE TABLE possiveis_duplicidades (
  id            serial PRIMARY KEY,
  iniciativa_a  integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  iniciativa_b  integer NOT NULL REFERENCES iniciativas(id) ON DELETE CASCADE,
  similaridade  real NOT NULL,
  motivo        text NOT NULL,
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmada', 'descartada')),
  revisado_por  integer REFERENCES usuarios(id),
  revisado_em   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (iniciativa_a < iniciativa_b),
  UNIQUE (iniciativa_a, iniciativa_b)
);

CREATE TABLE historico_alteracoes (
  id              bigserial PRIMARY KEY,
  entidade        text NOT NULL,
  registro_id     integer NOT NULL,
  campo           text NOT NULL,
  valor_anterior  text,
  valor_novo      text,
  alterado_em     timestamptz NOT NULL DEFAULT now(),
  responsavel_id  integer REFERENCES usuarios(id),
  justificativa   text
);
CREATE INDEX idx_hist_registro ON historico_alteracoes(entidade, registro_id);
CREATE INDEX idx_hist_data ON historico_alteracoes(alterado_em DESC);

CREATE TABLE tarefas_atualizacao (
  id                 serial PRIMARY KEY,
  nome               text NOT NULL,
  escopo             jsonb NOT NULL,    -- {"estados": [...], "regioes": [...], "universidade_ids": [...], "somente_situacoes": [...]}
  modo               text NOT NULL DEFAULT 'busca_api' CHECK (modo IN ('busca_api')),
  periodicidade_dias integer NOT NULL CHECK (periodicidade_dias BETWEEN 1 AND 3650),
  limite_por_execucao integer NOT NULL DEFAULT 10 CHECK (limite_por_execucao BETWEEN 1 AND 500),
  ativa              boolean NOT NULL DEFAULT true,
  ultima_execucao    timestamptz,
  proxima_execucao   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE relatos_erro (
  id               serial PRIMARY KEY,
  tipo_registro    text NOT NULL CHECK (tipo_registro IN ('universidade', 'iniciativa', 'geral')),
  registro_id      integer,
  descricao        text NOT NULL CHECK (length(descricao) BETWEEN 10 AND 4000),
  url_referencia   text,
  contato          text,               -- opcional; nunca exposto publicamente
  status           text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_analise', 'resolvido', 'descartado')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Taxonomia inicial (alterável pela administração)
-- ---------------------------------------------------------------------------
INSERT INTO categorias (codigo, nome, descricao, inclui, ordem) VALUES
 ('politica_institucional', 'Política institucional',
  'Políticas, planos, normativas e programas institucionais formalmente estabelecidos com ações explícitas de saúde mental.',
  'Políticas formais de saúde mental; políticas de atenção psicossocial; planos institucionais de prevenção; diretrizes de acolhimento; normativas e resoluções; políticas de assistência estudantil com ações explícitas de saúde mental; programas institucionais formalmente estabelecidos. Um serviço de psicologia, por si só, não é classificado como política.', 1),
 ('projeto_extensao', 'Projeto de extensão',
  'Projetos de extensão universitária voltados ao cuidado, à prevenção ou à promoção da saúde mental.',
  'Projetos de acolhimento; grupos de escuta; rodas de conversa; oficinas; projetos de prevenção; campanhas educativas; promoção do bem-estar; combate ao estigma; ações para a comunidade universitária ou externa.', 2),
 ('servico_permanente', 'Serviço permanente',
  'Serviços institucionais contínuos de atenção psicológica, psicopedagógica ou psicossocial.',
  'Serviços de psicologia; núcleos de apoio psicopedagógico; serviços de atenção psicossocial; clínicas-escola; assistência estudantil com atendimento em saúde mental; acompanhamento psicológico ou psiquiátrico documentado.', 3),
 ('acao_pontual', 'Programa ou ação pontual',
  'Ações periódicas ou isoladas de conscientização e promoção.',
  'Campanhas; eventos; palestras; semanas temáticas; atividades de conscientização; ações periódicas ou isoladas.', 4),
 ('pesquisa_formacao', 'Pesquisa, formação e capacitação',
  'Iniciativas de produção e disseminação de conhecimento e de formação sobre saúde mental.',
  'Capacitação de servidores; formação de profissionais; grupos de pesquisa; pesquisas aplicadas; ações de formação; produção e disseminação de conhecimento.', 5);

INSERT INTO publicos_alvo (codigo, nome, ordem) VALUES
 ('estudantes', 'Estudantes (geral)', 1),
 ('estudantes_graduacao', 'Estudantes de graduação', 2),
 ('pos_graduandos', 'Estudantes de pós-graduação', 3),
 ('docentes', 'Docentes', 4),
 ('tecnicos_administrativos', 'Técnicos-administrativos', 5),
 ('servidores', 'Servidores (geral)', 6),
 ('comunidade_universitaria', 'Comunidade universitária', 7),
 ('comunidade_externa', 'Comunidade externa', 8),
 ('estudantes_assistencia', 'Estudantes atendidos pela assistência estudantil', 9),
 ('outros', 'Outros públicos', 10);
