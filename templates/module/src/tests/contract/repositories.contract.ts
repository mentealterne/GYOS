// The promises every SampleRepositories keeps, on Postgres or in memory. The unit tier runs this
// suite on the in-memory twin the scenarios use, the integration tier on Postgres: the scenarios
// can trust the twin as far as this suite goes. A promise added to a port is added here.
import { beforeEach, describe, expect, it } from "vitest";
import type { SampleRepositories } from "../../repositories.ts";

const ACME = "tenant-acme";
const GLOBEX = "tenant-globex";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const at = (minute: number): Date => new Date(Date.UTC(2026, 0, 5, 9, minute));

/** `fresh` returns repositories on an empty store. */
export function describeRepositoriesContract(name: string, fresh: () => Promise<SampleRepositories>): void {
  let repositories: SampleRepositories;
  beforeEach(async () => {
    repositories = await fresh();
  });

  async function insert(tenantId: string, itemName: string, minute: number) {
    const created = await repositories.items.insert({ tenantId, name: itemName, createdAt: at(minute) });
    if (created === "name-taken") throw new Error(`"${itemName}" was refused`);
    return created;
  }
  const namesOf = async (tenantId: string): Promise<string[]> =>
    (await repositories.items.listByTenant(tenantId)).map((item) => item.name);

  describe(`the item repository (${name})`, () => {
    it("stores an item and reads it back as a domain item", async () => {
      const created = await insert(ACME, "Blue widget", 0);
      expect(created).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        tenantId: ACME,
        name: "Blue widget",
        createdAt: at(0),
        updatedAt: at(0),
      });
      expect(await repositories.items.findById(ACME, created.id)).toEqual(created);
      expect(await repositories.items.findByName(ACME, "Blue widget")).toEqual(created);
    });

    it("finds nothing that isn't there", async () => {
      expect(await repositories.items.findById(ACME, UNKNOWN_ID)).toBeNull();
      expect(await repositories.items.findByName(ACME, "Blue widget")).toBeNull();
      expect(await repositories.items.listByTenant(ACME)).toEqual([]);
    });

    it("lists a tenant's items oldest first, and only that tenant's", async () => {
      await insert(ACME, "Second", 2);
      await insert(ACME, "First", 1);
      await insert(GLOBEX, "Other", 0);
      expect(await namesOf(ACME)).toEqual(["First", "Second"]);
    });

    it("does not find or rename another tenant's item", async () => {
      const created = await insert(ACME, "Blue widget", 0);
      expect(await repositories.items.findById(GLOBEX, created.id)).toBeNull();
      expect(await repositories.items.findByName(GLOBEX, "Blue widget")).toBeNull();
      expect(await repositories.items.rename(GLOBEX, created.id, "Mine", at(1))).toBe("not-found");
    });

    it("reports a taken name on insert and on rename, within one tenant only", async () => {
      await insert(ACME, "Blue widget", 0);
      const green = await insert(ACME, "Green widget", 1);
      expect(await repositories.items.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(2) })).toBe(
        "name-taken",
      );
      expect(await repositories.items.rename(ACME, green.id, "Blue widget", at(3))).toBe("name-taken");
      await insert(GLOBEX, "Blue widget", 4);
    });

    it("renames an item and stamps the change", async () => {
      const created = await insert(ACME, "Blue widget", 0);
      expect(await repositories.items.rename(ACME, created.id, "Navy widget", at(5))).toEqual({
        ...created,
        name: "Navy widget",
        updatedAt: at(5),
      });
      expect(await repositories.items.findByName(ACME, "Blue widget")).toBeNull();
    });

    it("lets an item be renamed to its own name", async () => {
      const created = await insert(ACME, "Blue widget", 0);
      expect(await repositories.items.rename(ACME, created.id, "Blue widget", at(1))).toMatchObject({
        name: "Blue widget",
      });
    });

    it("reports an unknown item on rename", async () => {
      expect(await repositories.items.rename(ACME, UNKNOWN_ID, "Blue widget", at(0))).toBe("not-found");
    });
  });

  describe(`transaction() (${name})`, () => {
    it("keeps every write, and returns what the work returns, when the work resolves", async () => {
      const result = await repositories.transaction(async (tx) => {
        await tx.items.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
        await tx.items.insert({ tenantId: ACME, name: "Green widget", createdAt: at(1) });
        return "done";
      });
      expect(result).toBe("done");
      expect(await namesOf(ACME)).toEqual(["Blue widget", "Green widget"]);
    });

    it("leaves none of its writes behind when the work rejects", async () => {
      const blue = await insert(ACME, "Blue widget", 0);
      const failure = new Error("the second write failed");
      const work = repositories.transaction(async (tx) => {
        await tx.items.insert({ tenantId: ACME, name: "Green widget", createdAt: at(1) });
        await tx.items.rename(ACME, blue.id, "Navy widget", at(2));
        throw failure;
      });
      await expect(work).rejects.toBe(failure);
      expect(await repositories.items.listByTenant(ACME)).toEqual([blue]);
    });

    it("rolls back a nested transaction alone, like a savepoint", async () => {
      await repositories.transaction(async (tx) => {
        await tx.items.insert({ tenantId: ACME, name: "Blue widget", createdAt: at(0) });
        const nested = tx.transaction(async (inner) => {
          await inner.items.insert({ tenantId: ACME, name: "Green widget", createdAt: at(1) });
          throw new Error("refused");
        });
        await expect(nested).rejects.toThrow("refused");
      });
      expect(await namesOf(ACME)).toEqual(["Blue widget"]);
    });
  });
}
