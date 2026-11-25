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

  it("the module refuses a duplicate name through its controller", async () => {
    const module = createSampleModule({ db: pool });
    await module.items.create(ACME, { name: "Blue widget" });
    const refusal = module.items.create(ACME, { name: " Blue widget " });
    await expect(refusal).rejects.toBeInstanceOf(SampleItemError);
    await expect(refusal).rejects.toMatchObject({ code: "duplicate-name" });
  });
});
