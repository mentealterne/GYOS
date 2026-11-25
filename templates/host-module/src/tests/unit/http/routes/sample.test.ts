// The routes of @module/sample, over HTTP, on a fake of the module: what each outcome becomes.
// The fake implements the module's public type and parses with its published schemas, so invalid
// input fails the way the module's own does; what the module decides is proven in the module.
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SampleItemError } from "@module/sample";
import type { Item, SampleModule } from "@module/sample/contracts";
import { createItemInputSchema, renameItemInputSchema } from "@module/sample/items";
import { createSampleRoutes } from "../../../../http/routes/sample.ts";
import { TENANT_HEADER } from "../../../../http/tenant.ts";
import { startApp, type TestApp } from "../../../support/test-app.ts";

interface FakeSampleModule extends SampleModule {
  /** The next call to the module throws this, whatever it is. */
  failNextCallWith(error: unknown): void;
}

function createFakeSampleModule(): FakeSampleModule {
  const stored: Item[] = [];
  let failure: { error: unknown } | undefined;
  const failIfAsked = (): void => {
    if (failure === undefined) return;
    const { error } = failure;
    failure = undefined;
    throw error;
  };
  return {
    failNextCallWith: (error) => {
      failure = { error };
    },
    ready: async () => {},
    items: {
      async create(tenantId, input) {
        failIfAsked();
        const { name } = createItemInputSchema.parse(input);
        if (stored.some((item) => item.tenantId === tenantId && item.name === name)) {
          throw new SampleItemError("duplicate-name", `An item called "${name}" already exists.`);
        }
        const now = new Date();
        const item: Item = { id: randomUUID(), tenantId, name, createdAt: now, updatedAt: now };
        stored.push(item);
        return item;
      },
      async list(tenantId) {
        failIfAsked();
        return stored.filter((item) => item.tenantId === tenantId);
      },
      async rename(tenantId, itemId, input) {
        failIfAsked();
        const { name } = renameItemInputSchema.parse(input);
        const item = stored.find((candidate) => candidate.tenantId === tenantId && candidate.id === itemId);
        if (item === undefined) throw new SampleItemError("not-found", `No item with id ${itemId}.`);
        item.name = name;
        return item;
      },
    },
  };
}

const ACME = { [TENANT_HEADER]: "tenant-acme" };
const GLOBEX = { [TENANT_HEADER]: "tenant-globex" };

let fake: FakeSampleModule;
let app: TestApp;

beforeEach(async () => {
  fake = createFakeSampleModule();
  app = await startApp({ routes: Router().use("/sample", createSampleRoutes(fake)) });
});
afterEach(async () => {
  await app.close();
});

describe("/sample/items", () => {
  it("creates an item, then lists it: 201, then 200", async () => {
    const created = await app.request("POST", "/sample/items", { headers: ACME, json: { name: "Blue widget" } });
    expect(created).toMatchObject({ status: 201, body: { name: "Blue widget", id: expect.any(String) } });

    const listed = await app.request("GET", "/sample/items", { headers: ACME });
    expect(listed).toMatchObject({ status: 200, body: { items: [{ name: "Blue widget" }] } });
    expect(await app.request("GET", "/sample/items", { headers: GLOBEX })).toMatchObject({ body: { items: [] } });
  });

  it("renames an item: 200", async () => {
    const created = await app.request("POST", "/sample/items", { headers: ACME, json: { name: "Blue widget" } });
    const { id } = created.body as { id: string };
    expect(
      await app.request("PATCH", `/sample/items/${id}`, { headers: ACME, json: { name: "Navy widget" } }),
    ).toMatchObject({ status: 200, body: { id, name: "Navy widget" } });
  });

  it("invalid input: 400, with the module's issues", async () => {
    const response = await app.request("POST", "/sample/items", { headers: ACME, json: { name: "" } });
    expect(response).toMatchObject({
      status: 400,
      body: { error: { code: "invalid-input", issues: [{ path: ["name"], message: expect.any(String) }] } },
    });
  });

  it("no body at all is invalid input too: 400", async () => {
    expect(await app.request("POST", "/sample/items", { headers: ACME })).toMatchObject({
      status: 400,
      body: { error: { code: "invalid-input" } },
    });
  });

  it("a name already taken: 409, with the module's code and message", async () => {
    await app.request("POST", "/sample/items", { headers: ACME, json: { name: "Blue widget" } });
    const response = await app.request("POST", "/sample/items", { headers: ACME, json: { name: "Blue widget" } });
    expect(response).toMatchObject({
      status: 409,
      body: { error: { code: "duplicate-name", message: 'An item called "Blue widget" already exists.' } },
    });
  });

  it("an item that doesn't exist: 404", async () => {
    const response = await app.request("PATCH", `/sample/items/${randomUUID()}`, {
      headers: ACME,
      json: { name: "Navy widget" },
    });
    expect(response).toMatchObject({ status: 404, body: { error: { code: "not-found" } } });
  });

  it("a bug in the module: 500, and nothing about it in the response", async () => {
    fake.failNextCallWith(new Error('relation "sample"."items" does not exist'));
    const response = await app.request("GET", "/sample/items", { headers: ACME });
    expect(response).toMatchObject({ status: 500, body: { error: { code: "internal" } } });
    expect(response.text).not.toContain("relation");
    expect(app.logs).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringContaining("relation") }));
  });

  it("no tenant: 400, and the module is not called", async () => {
    fake.failNextCallWith(new Error("the module was called"));
    expect(await app.request("GET", "/sample/items")).toMatchObject({
      status: 400,
      body: { error: { code: "missing-tenant" } },
    });
  });
});
