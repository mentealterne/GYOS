// Unit and architecture tests: no database. Integration tests have their own config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Another module imported by a test resolves to its src/, not its build. Tests run in Vite's
  // server environment, so the condition goes in ssr.resolve (resolve.conditions alone is not
  // used there); it replaces Vite's defaults, which are kept after it.
  ssr: { resolve: { conditions: ["@gyos/source", "module", "node", "development|production"] } },
  test: {
    include: ["src/tests/unit/**/*.test.ts"],
  },
});
