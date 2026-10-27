import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Permite importar los route handlers fuera de Next.js.
      "server-only": fileURLToPath(
        new URL("./tests/integracion/server-only.ts", import.meta.url)
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integracion/**", "node_modules/**"],
  },
})
