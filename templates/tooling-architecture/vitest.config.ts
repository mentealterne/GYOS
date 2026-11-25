// Checks that span the workspace: what no single module can check about itself.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
