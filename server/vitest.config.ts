import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Os testes compartilham um único banco de testes: execução sequencial.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: ["./test/global-setup.ts"],
    env: { NODE_ENV: "test", COLETA_PERMITIR_REDE_PRIVADA: "true", COLETA_INTERVALO_HOST_MS: "0", EXTRATOR: "heuristico", BUSCA_PROVEDOR: "nenhum" },
  },
});
