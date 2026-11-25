// ready() without a database: a pool that accepts every statement and returns no rows lets the
// real migration code run, so these tests reach the memo around it. The integration tests run
// ready() on Postgres.
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createSampleModule } from "../../index.ts";
import type { SampleLogger } from "../../logger.ts";

function acceptingPool(): { pool: Pool; connections: () => number } {
  let connections = 0;
  const result = { rows: [], rowCount: 0, fields: [] };
  const client = { query: async () => result, release: () => {} };
  const pool = {
    connect: async () => {
      connections += 1;
      return client;
    },
    query: async () => result,
  } as unknown as Pool;
  return { pool, connections: () => connections };
}

function loggerWith(info: SampleLogger["info"]): SampleLogger {
  const logger: SampleLogger = { error: () => {}, warn: () => {}, info, debug: () => {}, child: () => logger };
  return logger;
}

describe("ready()", () => {
  it("migrates once, shares the run in flight, and says it is ready once", async () => {
    const { pool, connections } = acceptingPool();
    const info = vi.fn();
    const module = createSampleModule({ db: pool, logger: loggerWith(info) });

    const first = module.ready();
    expect(module.ready()).toBe(first);
    await first;
    await module.ready();

    expect(connections()).toBe(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("ready");
  });

  it("forgets a run whose ready line throws, so the next call retries", async () => {
    const { pool, connections } = acceptingPool();
    const info = vi.fn<SampleLogger["info"]>().mockImplementationOnce(() => {
      throw new Error("the log transport is down");
    });
    const module = createSampleModule({ db: pool, logger: loggerWith(info) });

    await expect(module.ready()).rejects.toThrow("the log transport is down");
    await expect(module.ready()).resolves.toBeUndefined();

    expect(connections()).toBe(2);
    expect(info).toHaveBeenCalledTimes(2);
  });
});
