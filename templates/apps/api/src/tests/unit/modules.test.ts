// buildModules builds every module without opening anything (standards/module.md, M1 and M3):
// a pool that refuses every call is enough, as long as nothing calls it.
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildModules } from "../../modules.ts";
import { recordingLogger } from "../support/test-app.ts";

const untouchable = {
  connect: () => {
    throw new Error("buildModules connected to the database");
  },
  query: () => {
    throw new Error("buildModules queried the database");
  },
} as unknown as Pool;

describe("buildModules", () => {
  it("builds every module without touching the database", () => {
    expect(() => buildModules({ pool: untouchable, logger: recordingLogger(), clock: () => new Date() })).not.toThrow();
  });
});
