import { defineConfig } from "vitest/config"

import base from "./vitest.config"

// Pruebas contra servicios reales (Open-Meteo y Supabase): npm run test:integracion
export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ["tests/integracion/**/*.test.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
  },
})
