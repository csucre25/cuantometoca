import { defineConfig } from "vitest/config";

// Cobertura mínima del motor de cálculo: 95% (docs/02 §5).
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
