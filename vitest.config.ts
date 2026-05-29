import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@engine": new URL("./src/engine", import.meta.url).pathname,
    },
  },
});
