import { criarApp } from "./app.js";
import { marcarExecucoesInterrompidas } from "./coleta/fila.js";
import { config } from "./config.js";
import { aplicarMigracoes } from "./lib/migracoes.js";

await aplicarMigracoes(config.databaseUrl);
await marcarExecucoesInterrompidas();

criarApp().listen(config.PORT, () => {
  console.log(`ONISMU API em http://localhost:${config.PORT} (${config.NODE_ENV})`);
  console.log(`Busca: ${config.BUSCA_PROVEDOR} · Extrator: ${config.EXTRATOR}`);
});
