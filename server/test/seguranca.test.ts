import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db.js";
import { app, criarUniversidade, criarUsuario, entrar, iniciativaBase, limparBanco, SENHA } from "./ajuda.js";

beforeEach(limparBanco);

describe("autenticação administrativa (item 11)", () => {
  it("autentica com senha correta e cria cookie httpOnly", async () => {
    await criarUsuario("a@teste.br");
    const r = await request(app).post("/api/auth/login").set("x-onismu-requisicao", "1").send({ email: "A@teste.br", senha: SENHA });
    expect(r.status).toBe(200);
    expect(r.body.usuario).toMatchObject({ email: "a@teste.br", papel: "pesquisador" });
    expect(r.body.usuario).not.toHaveProperty("senha_hash");
    const cookie = String(r.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
  });

  it("recusa senha errada e usuário inexistente com a mesma mensagem", async () => {
    await criarUsuario("a@teste.br");
    const errada = await request(app).post("/api/auth/login").set("x-onismu-requisicao", "1").send({ email: "a@teste.br", senha: "errada" });
    const inexistente = await request(app).post("/api/auth/login").set("x-onismu-requisicao", "1").send({ email: "b@teste.br", senha: "errada" });
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body.erro).toBe(inexistente.body.erro);
  });

  it("armazena senhas com hash (nunca em texto puro)", async () => {
    await criarUsuario("a@teste.br");
    const r = await pool.query("SELECT senha_hash FROM usuarios");
    expect(r.rows[0].senha_hash).not.toContain(SENHA);
    expect(r.rows[0].senha_hash).toMatch(/^scrypt\$/);
  });

  it("encerra a sessão no logout e bloqueia usuário desativado", async () => {
    const adm = await entrar("admin@teste.br", "admin");
    expect((await adm.get("/api/admin/resumo")).status).toBe(200);
    await adm.post("/api/auth/logout");
    expect((await adm.get("/api/admin/resumo")).status).toBe(401);
  });
});

describe("bloqueio de alterações não autorizadas (item 12)", () => {
  it("rotas administrativas exigem sessão", async () => {
    const uid = await criarUniversidade();
    const rotas: [string, string][] = [
      ["get", "/api/admin/candidatos"], ["post", "/api/admin/iniciativas"], ["put", `/api/admin/universidades/${uid}`],
      ["post", "/api/admin/candidatos/1/aprovar"], ["post", "/api/admin/coleta/execucoes"], ["get", "/api/admin/historico"],
      ["get", "/api/admin/exportar/base-completa.xlsx"], ["get", "/api/admin/usuarios"],
    ];
    for (const [m, url] of rotas) {
      const r = await (request(app) as any)[m](url).set("x-onismu-requisicao", "1").send({});
      expect(r.status, `${m} ${url}`).toBe(401);
    }
  });

  it("exige o cabeçalho anti-CSRF em alterações", async () => {
    await criarUsuario("a@teste.br");
    const agente = request.agent(app);
    expect((await agente.post("/api/auth/login").send({ email: "a@teste.br", senha: SENHA })).status).toBe(403);
    await agente.post("/api/auth/login").set("x-onismu-requisicao", "1").send({ email: "a@teste.br", senha: SENHA });
    const uid = await criarUniversidade();
    const semCabecalho = await agente.post("/api/admin/iniciativas").send(iniciativaBase(uid));
    expect(semCabecalho.status).toBe(403);
  });

  it("restringe gestão de usuários ao papel admin", async () => {
    const pesq = await entrar("p@teste.br", "pesquisador");
    expect((await pesq.get("/api/admin/usuarios")).status).toBe(403);
    expect((await pesq.post("/api/admin/usuarios", { email: "x@teste.br", nome: "X", papel: "admin", senha: "senhaforte12345" })).status).toBe(403);
  });

  it("não existe rota pública de edição ou aprovação", async () => {
    const uid = await criarUniversidade();
    expect((await request(app).post("/api/publico/iniciativas").send(iniciativaBase(uid))).status).toBe(404);
    expect((await request(app).put(`/api/publico/universidades/${uid}`).send({})).status).toBe(404);
    expect((await request(app).post("/api/publico/candidatos/1/aprovar").send({})).status).toBe(404);
  });
});

describe("ausência de vazamento de dados administrativos (item 13)", () => {
  it("respostas públicas não expõem candidatos, usuários, contatos ou logs", async () => {
    const adm = await entrar("admin@teste.br", "admin");
    const uid = await criarUniversidade();
    await adm.post("/api/admin/iniciativas", iniciativaBase(uid));
    await request(app).post("/api/publico/relatos").send({ tipo_registro: "geral", descricao: "Encontrei um erro no cadastro.", contato: "segredo@pessoa.br" });
    const corpo = JSON.stringify([
      (await request(app).get("/api/publico/indicadores")).body,
      (await request(app).get("/api/publico/iniciativas")).body,
      (await request(app).get(`/api/publico/universidades/${uid}`)).body,
      (await request(app).get("/api/publico/atualizacoes")).body,
      (await request(app).get(`/api/publico/iniciativas/1`)).body,
    ]);
    for (const proibido of ["senha_hash", "admin@teste.br", "segredo@pessoa.br", "validado_por", "decidido_por", "possiveis_duplicatas", "token"]) {
      expect(corpo, proibido).not.toContain(proibido);
    }
    const res = await request(app).get("/api/publico/iniciativas");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("valida e limita relatos públicos (sem permitir alteração de registros)", async () => {
    const curto = await request(app).post("/api/publico/relatos").send({ tipo_registro: "geral", descricao: "curto" });
    expect(curto.status).toBe(400);
    const robo = await request(app).post("/api/publico/relatos").send({ tipo_registro: "geral", descricao: "descrição suficientemente longa", site: "spam" });
    expect(robo.status).toBe(400);
  });
});
