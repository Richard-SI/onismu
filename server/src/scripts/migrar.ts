import { config } from "../config.js";
import { aplicarMigracoes } from "../lib/migracoes.js";

const aplicadas = await aplicarMigracoes(config.databaseUrl);
console.log(aplicadas.length ? `${aplicadas.length} migração(ões) aplicada(s).` : "Banco já está atualizado.");
