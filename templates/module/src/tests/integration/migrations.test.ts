import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MIGRATION_LOCK_KEY } from "../../db/migrate.ts";
import { SAMPLE_SCHEMA } from "../../db/schema.ts";
import { createSampleModule } from "../../index.ts";
import type { SampleLogger } from "../../logger.ts";
import { SAMPLE_MIGRATIONS_FOLDER } from "../../migrations.ts";
import { dropSchema, MIGRATIONS, newPool } from "./database.ts";

const journal = JSON.parse(
  readFileSync(join(SAMPLE_MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
) as { entries: unknown[] };

let admin: pg.Pool;

beforeAll(() => {
  admin = newPool();
});
afterAll(async () => {
  await admin?.end(); // undefined when newPool() refused the database
});
beforeEach(async () => {
  await dropSchema(admin);
});

async function appliedMigrations(): Promise<{ hash: string }[]> {
  const { rows } = await admin.query<{ hash: string }>(`select hash from ${MIGRATIONS}`);
  return rows;
}

describe("ready()", () => {
  it("creates the schema and its tables", async () => {
    await createSampleModule({ db: admin }).ready();
    const { rows } = await admin.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1",
      [SAMPLE_SCHEMA],
    );
    expect(rows.map((row) => row.table_name)).toContain("items");
    expect(await appliedMigrations()).toHaveLength(journal.entries.length);
  });

  it("applies each migration once when two pools call it at the same time", async () => {
    const first = newPool();
    const second = newPool();
    try {
      await Promise.all([
        createSampleModule({ db: first }).ready(),
        createSampleModule({ db: second }).ready(),
      ]);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }
    const applied = await appliedMigrations();
    expect(applied).toHaveLength(journal.entries.length);
    expect(new Set(applied.map((row) => row.hash)).size).toBe(applied.length);
  });

  it("gives up waiting for the migration lock after migrationLockTimeoutMs, and says why", async () => {
    // Another process holds the workspace's migration lock and doesn't let go. (Retrying after a
    // failure is tested in the unit tier: here, other modules' tests may hold the shared lock.)
    const holder = await admin.connect();
    try {
      await holder.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      const started = performance.now();
      const run = createSampleModule({ db: admin, migrationLockTimeoutMs: 200 }).ready();
      await expect(run).rejects.toThrow("Waited 200 ms for the migration lock");
      await expect(run).rejects.toMatchObject({ cause: { code: "55P03" } });
      expect(performance.now() - started).toBeLessThan(5_000);
    } finally {
      holder.release(true); // ends the session, and the lock with it
    }
  });

  it("is a no-op the second time", async () => {
    await createSampleModule({ db: admin }).ready();
    await createSampleModule({ db: admin }).ready();
    expect(await appliedMigrations()).toHaveLength(journal.entries.length);
  });

  it("shares the run in flight, forgets a failed run, and says it is ready once", async () => {
    // A pool whose first connection attempt fails, as when the database is still starting.
    let refuse = true;
    const flaky = new Proxy(admin, {
      get(target, property) {
        if (property === "connect" && refuse) {
          return async () => {
            refuse = false;
            throw new Error("connection refused");
          };
        }
        const value: unknown = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const info = vi.fn();
    const logger: SampleLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info,
      debug: vi.fn(),
      child: () => logger,
    };
    const module = createSampleModule({ db: flaky, logger });

    const inFlight = module.ready();
    expect(module.ready()).toBe(inFlight);
    await expect(inFlight).rejects.toThrow("connection refused");

    await module.ready();
    expect(await appliedMigrations()).toHaveLength(journal.entries.length);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("ready");
  });
});
