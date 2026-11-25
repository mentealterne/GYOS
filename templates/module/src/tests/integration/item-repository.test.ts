import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSampleModule, SampleItemError } from "../../index.ts";
import { createPostgresItemRepository } from "../../items/adapters/item-repository.postgres.ts";
import type { ItemRepository } from "../../items/ports.ts";
import { SAMPLE_SCHEMA } from "../../db/schema.ts";
import { dropSchema, newPool, quote } from "./database.ts";

const ACME = "tenant-acme";
const GLOBEX = "tenant-globex";
const ITEMS = `${quote(SAMPLE_SCHEMA)}.${quote("items")}`;
const at = (minute: number) => new Date(Date.UTC(2026, 0, 5, 9, minute));

let pool: pg.Pool;
let repository: ItemRepository;

beforeAll(async () => {
  pool = newPool();
  await dropSchema(pool);
  await createSampleModule({ db: pool }).ready();
  repository = createPostgresItemRepository(drizzle({ client: pool }));
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await pool.query(`truncate ${ITEMS}`);
});

describe("the Postgres item repository", () => {
  it("stores an item and reads it back as a domain item", async () => {
    const created = await repository.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      tenantId: ACME,
      name: "Blue widget",
      createdAt: at(0),
      updatedAt: at(0),
    });
    if (created === "name-taken") throw new Error("unexpected");
    expect(await repository.findById(ACME, created.id)).toEqual(created);
    expect(await repository.findByName(ACME, "Blue widget")).toEqual(created);
  });

  it("lists a tenant's items oldest first, and only that tenant's", async () => {
    await repository.insert({ tenantId: ACME, name: "Second", createdAt: at(2) });
    await repository.insert({ tenantId: ACME, name: "First", createdAt: at(1) });
    await repository.insert({ tenantId: GLOBEX, name: "Other", createdAt: at(0) });
    const names = (await repository.listByTenant(ACME)).map((item) => item.name);
    expect(names).toEqual(["First", "Second"]);
  });

  it("does not find another tenant's item", async () => {
    const created = await repository.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
    if (created === "name-taken") throw new Error("unexpected");
    expect(await repository.findById(GLOBEX, created.id)).toBeNull();
    expect(await repository.rename(GLOBEX, created.id, "Mine", at(1))).toBe("not-found");
  });

  it("reports a taken name on insert and on rename", async () => {
    await repository.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
    const green = await repository.insert({ tenantId: ACME, name: "Green widget", createdAt: at(1) });
    if (green === "name-taken") throw new Error("unexpected");
    expect(await repository.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(2) })).toBe(
      "name-taken",
    );
    expect(await repository.rename(ACME, green.id, "Blue widget", at(3))).toBe("name-taken");
    expect(await repository.insert({ tenantId: GLOBEX, name: "Blue widget", createdAt: at(4) })).not.toBe(
      "name-taken",
    );
  });

  it("renames an item and stamps the change", async () => {
    const created = await repository.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
    if (created === "name-taken") throw new Error("unexpected");
    expect(await repository.rename(ACME, created.id, "Navy widget", at(5))).toEqual({
      ...created,
      name: "Navy widget",
      updatedAt: at(5),
    });
  });
});

describe("the unique index on (tenant_id, name)", () => {
  it("refuses a duplicate written around the adapter", async () => {
    const insert = `insert into ${ITEMS} (tenant_id, name, created_at, updated_at) values ($1, $2, now(), now())`;
    await pool.query(insert, [ACME, "Blue widget"]);
    await expect(pool.query(insert, [ACME, "Blue widget"])).rejects.toMatchObject({ code: "23505" });
  });
});

describe("the module on Postgres", () => {
  it("refuses a duplicate name through its controller", async () => {
    const module = createSampleModule({ db: pool });
    await module.items.create(ACME, { name: "Blue widget" });
    const refusal = module.items.create(ACME, { name: " Blue widget " });
    await expect(refusal).rejects.toBeInstanceOf(SampleItemError);
    await expect(refusal).rejects.toMatchObject({ code: "duplicate-name" });
  });
});
