import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
  },
  css: false as any,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
