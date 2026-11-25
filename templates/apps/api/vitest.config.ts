// Unit tests: no database. The routes run on fakes of the modules. Integration tests have their
// own config.
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The modules resolve to their src/, not their build. Tests run in Vite's server environment,
  // so the condition goes in ssr.resolve; it replaces Vite's defaults, which are kept after it.
  ssr: { resolve: { conditions: ["@gyos/source", "module", "node", "development|production"] } },
  test: {
    include: ["src/tests/unit/**/*.test.ts"],
  },
});
