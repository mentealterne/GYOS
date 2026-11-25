import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  resolveSampleConfig,
  SampleConfigError,
  type SampleModuleConfig,
} from "../../../config/sample-config.ts";
import { SAMPLE_MIGRATIONS_FOLDER } from "../../../migrations.ts";

// Configuration is checked, not connected: a stand-in with the Pool's shape is enough.
const pool = { connect: async () => {}, query: async () => {} } as unknown as Pool;

describe("resolveSampleConfig", () => {
  it("fills in the defaults", () => {
    const config = resolveSampleConfig({ db: pool });
    expect(config.db).toBe(pool);
    expect(config.clock()).toBeInstanceOf(Date);
    expect(config.migrationsFolder).toBe(SAMPLE_MIGRATIONS_FOLDER);
    expect(typeof config.logger.child).toBe("function");
  });

  it("keeps what the host injects", () => {
    const clock = () => new Date(0);
    const config = resolveSampleConfig({ db: pool, clock, migrationsFolder: "/srv/app/drizzle" });
    expect(config.clock).toBe(clock);
    expect(config.migrationsFolder).toBe("/srv/app/drizzle");
  });

  it("lists every problem at once", () => {
    const bad = {
      db: {},
      logger: { info: () => {} },
      clock: "now",
      migrationsFolder: "drizzle",
    } as unknown as SampleModuleConfig;
    let caught: unknown;
    try {
      resolveSampleConfig(bad);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SampleConfigError);
    const problems = (caught as SampleConfigError).problems;
    expect(problems).toHaveLength(4);
    expect(problems.map((problem) => problem.split(":")[0])).toEqual([
      "db",
      "logger",
      "clock",
      "migrationsFolder",
    ]);
  });
});
