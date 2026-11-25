import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SAMPLE_SCHEMA } from "../../db/schema.ts";
import { createSampleModule, SampleItemError } from "../../index.ts";
import { createSampleRepositories } from "../../repositories.ts";
import { describeRepositoriesContract } from "../contract/repositories.contract.ts";
import { dropSchema, newPool, quote } from "./database.ts";

const ACME = "tenant-acme";
const ITEMS = `${quote(SAMPLE_SCHEMA)}.${quote("items")}`;
const at = (minute: number): Date => new Date(Date.UTC(2026, 0, 5, 9, minute));

let pool: pg.Pool;

beforeAll(async () => {
  pool = newPool();
  await dropSchema(pool);
  await createSampleModule({ db: pool }).ready();
});
afterAll(async () => {
  await pool.end();
});

// The same promises the in-memory twin keeps in the unit tier.
describeRepositoriesContract("Postgres", async () => {
  await pool.query(`truncate ${ITEMS}`);
  return createSampleRepositories(drizzle({ client: pool }));
});

describe("on Postgres only", () => {
  beforeEach(async () => {
    await pool.query(`truncate ${ITEMS}`);
  });

  it("the unique index refuses a duplicate written around the adapter", async () => {
    const insert = `insert into ${ITEMS} (tenant_id, name, created_at, updated_at) values ($1, $2, now(), now())`;
    await pool.query(insert, [ACME, "Blue widget"]);
    await expect(pool.query(insert, [ACME, "Blue widget"])).rejects.toMatchObject({ code: "23505" });
  });

  it("rename reports a taken name only for the name index, and throws for any other", async () => {
    const repositories = createSampleRepositories(drizzle({ client: pool }));
    const other = quote("items_test_updated_at_key");
    // A second unique index, as a later migration might add one.
    await pool.query(`create unique index ${other} on ${ITEMS} (updated_at)`);
    try {
      const blue = await repositories.items.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
      const green = await repositories.items.insert({ tenantId: ACME, name: "Green widget", createdAt: at(1) });
      if (blue === "name-taken" || green === "name-taken") throw new Error("unexpected");
      const rename = repositories.items.rename(ACME, green.id, "Navy widget", blue.updatedAt);
      await expect(rename).rejects.toMatchObject({
        cause: { code: "23505", constraint: "items_test_updated_at_key" },
      });
      expect(await repositories.items.rename(ACME, green.id, "Blue widget", at(2))).toBe("name-taken");
    } finally {
      await pool.query(`drop index ${quote(SAMPLE_SCHEMA)}.${other}`);
    }
  });

  it("the module refuses a duplicate name through its controller", async () => {
    const module = createSampleModule({ db: pool });
    await module.items.create(ACME, { name: "Blue widget" });
    const refusal = module.items.create(ACME, { name: " Blue widget " });
    await expect(refusal).rejects.toBeInstanceOf(SampleItemError);
    await expect(refusal).rejects.toMatchObject({ code: "duplicate-name" });
  });
});
