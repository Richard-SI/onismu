import path from "node:path";
import fs from "node:fs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { carregarUsuario, CABECALHO_CSRF, exigirAutenticacao, exigirCabecalhoCsrf } from "./auth/sessao.js";
import { config, RAIZ_PROJETO } from "./config.js";
import { pool } from "./db.js";
import { tratadorDeErros } from "./lib/erros.js";
import { rotasAdminRegistros } from "./routes/admin-registros.js";
import { rotasAdminRevisao } from "./routes/admin-revisao.js";
import { rotasAdminSistema } from "./routes/admin-sistema.js";
import { rotasAuth } from "./routes/auth.js";
import { rotasPublicas } from "./routes/publico.js";

export function criarApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.producao ? 1 : false);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(cors({
    origin: (origem, cb) => cb(null, !origem || config.corsOrigins.includes(origem)),
    credentials: true,
    allowedHeaders: ["Content-Type", CABECALHO_CSRF],
    methods: ["GET", "POST", "PUT", "DELETE"],
  }));
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === "test" ? 10_000 : 300, standardHeaders: true, legacyHeaders: false }));

  app.get("/api/saude", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  });

  app.use("/api/publico", rotasPublicas);
  app.use("/api/auth", carregarUsuario, rotasAuth);
  // Toda rota administrativa: sessão válida + cabeçalho anti-CSRF + papel verificado no servidor.
  const admin = express.Router();
  admin.use(carregarUsuario, exigirAutenticacao("admin", "pesquisador"), exigirCabecalhoCsrf);
  admin.use((_, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  admin.use(rotasAdminRegistros, rotasAdminRevisao, rotasAdminSistema);
  app.use("/api/admin", admin);
  app.use("/api", (_req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

  // Em produção, o mesmo processo serve o front-end compilado.
  const dist = path.join(RAIZ_PROJETO, "web", "dist");
  if (config.producao && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use(tratadorDeErros);
  return app;
}
