import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { SampleItemError } from "../../src/items/domain/errors.ts";
import { isSampleInputError } from "../../src/module-controllers/input-error.ts";
import type { SampleWorld } from "../support/world.ts";

async function itemIdOf(world: SampleWorld, tenant: string, name: string): Promise<string> {
  const items = await world.controllers.items.list(world.tenantId(tenant));
  const item = items.find((candidate) => candidate.name === name);
  assert.ok(item, `${tenant} has no item called "${name}"`);
  return item.id;
}

async function namesOf(world: SampleWorld, tenant: string): Promise<string[]> {
  const items = await world.controllers.items.list(world.tenantId(tenant));
  return items.map((item) => item.name);
}

Given("{tenant} has an item called {string}", async function (this: SampleWorld, tenant: string, name: string) {
  await this.controllers.items.create(this.tenantId(tenant), { name });
});

Given(
  "{tenant} has items called {string} and {string}",
  async function (this: SampleWorld, tenant: string, first: string, second: string) {
    await this.controllers.items.create(this.tenantId(tenant), { name: first });
    await this.controllers.items.create(this.tenantId(tenant), { name: second });
  },
);

When("{tenant} adds an item called {string}", async function (this: SampleWorld, tenant: string, name: string) {
  await this.attempt(() => this.controllers.items.create(this.tenantId(tenant), { name }));
});

When(
  "{tenant} renames {string} to {string}",
  async function (this: SampleWorld, tenant: string, from: string, to: string) {
    const itemId = await itemIdOf(this, tenant, from);
    await this.attempt(() => this.controllers.items.rename(this.tenantId(tenant), itemId, { name: to }));
  },
);

Then("{tenant} is told the name is already taken", function (this: SampleWorld, _tenant: string) {
  assert.ok(this.lastError instanceof SampleItemError, `expected a refusal, got ${String(this.lastError)}`);
  assert.equal(this.lastError.code, "duplicate-name");
});

Then("{tenant} is told the name is invalid", function (this: SampleWorld, _tenant: string) {
  assert.ok(isSampleInputError(this.lastError), `expected invalid input, got ${String(this.lastError)}`);
});

Then("{tenant} has {int} item(s)", async function (this: SampleWorld, tenant: string, count: number) {
  assert.equal((await namesOf(this, tenant)).length, count);
});

Then("{tenant}'s items are {string}", async function (this: SampleWorld, tenant: string, name: string) {
  assert.deepEqual(await namesOf(this, tenant), [name]);
});

Then(
  "{tenant}'s items are {string} and {string}",
  async function (this: SampleWorld, tenant: string, first: string, second: string) {
    assert.deepEqual(await namesOf(this, tenant), [first, second]);
  },
);
