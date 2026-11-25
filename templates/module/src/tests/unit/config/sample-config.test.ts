import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
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
    expect(config.migrationLockTimeoutMs).toBe(DEFAULT_MIGRATION_LOCK_TIMEOUT_MS);
    expect(typeof config.logger.child).toBe("function");
  });

  it("keeps what the host injects", () => {
    const clock = () => new Date(0);
    const config = resolveSampleConfig({
      db: pool,
      clock,
      migrationsFolder: "/srv/app/drizzle",
      migrationLockTimeoutMs: 1_000,
    });
    expect(config.clock).toBe(clock);
    expect(config.migrationsFolder).toBe("/srv/app/drizzle");
    expect(config.migrationLockTimeoutMs).toBe(1_000);
  });

  it("lists every problem at once", () => {
    const bad = {
      db: {},
      logger: { info: () => {} },
      clock: "now",
      migrationsFolder: "drizzle",
      migrationLockTimeoutMs: "60s",
    } as unknown as SampleModuleConfig;
    let caught: unknown;
    try {
      resolveSampleConfig(bad);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SampleConfigError);
    const problems = (caught as SampleConfigError).problems;
    expect(problems).toHaveLength(5);
    expect(problems.map((problem) => problem.split(":")[0])).toEqual([
      "db",
      "logger",
      "clock",
      "migrationsFolder",
      "migrationLockTimeoutMs",
    ]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a lock timeout of %s ms", (value) => {
    expect(() => resolveSampleConfig({ db: pool, migrationLockTimeoutMs: value })).toThrow(
      "migrationLockTimeoutMs: expected a positive whole number of milliseconds",
    );
  });
});
