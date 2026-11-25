// Integration tests: every module, built the way main.ts builds them, on a real Postgres
// (TEST_DATABASE_URL, see src/tests/integration/database.ts).
import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: { resolve: { conditions: ["@gyos/source", "module", "node", "development|production"] } },
  test: {
    include: ["src/tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
