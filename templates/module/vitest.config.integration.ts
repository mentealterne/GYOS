// Integration tests: the adapters and the migrations against a real Postgres (DATABASE_URL).
// Files run one at a time, because they share this module's schema.
import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: { resolve: { conditions: ["@gyos/source", "module", "node", "development|production"] } },
  test: {
    include: ["src/tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
