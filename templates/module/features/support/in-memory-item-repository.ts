// ItemRepository in memory. Shared by the scenarios and the unit tests, so a phrase like
// "Acme has an item called ..." means the same thing everywhere. It keeps the same promises as
// the Postgres adapter, the unique (tenant, name) pair included.
import { randomUUID } from "node:crypto";
import type { Item, ItemRepository } from "../../src/items/ports.ts";

export interface InMemoryItemRepository extends ItemRepository {
  /** Every stored item, for assertions. */
  all(): Item[];
  /** Puts back what all() returned: how the in-memory transaction rolls back. */
  restore(items: Item[]): void;
}

export function createInMemoryItemRepository(seed: Item[] = []): InMemoryItemRepository {
  const rows = new Map<string, Item>(seed.map((item) => [item.id, { ...item }]));
  const ofTenant = (tenantId: string): Item[] =>
    [...rows.values()].filter((item) => item.tenantId === tenantId);
  const nameTaken = (tenantId: string, name: string, exceptId?: string): boolean =>
    ofTenant(tenantId).some((item) => item.name === name && item.id !== exceptId);

  return {
    async listByTenant(tenantId) {
      return ofTenant(tenantId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => ({ ...item }));
    },

    async findById(tenantId, itemId) {
      const item = rows.get(itemId);
      return item !== undefined && item.tenantId === tenantId ? { ...item } : null;
    },

    async findByName(tenantId, name) {
      const item = ofTenant(tenantId).find((candidate) => candidate.name === name);
      return item === undefined ? null : { ...item };
    },

    async insert({ tenantId, name, createdAt }) {
      if (nameTaken(tenantId, name)) return "name-taken";
      const item: Item = { id: randomUUID(), tenantId, name, createdAt, updatedAt: createdAt };
      rows.set(item.id, item);
      return { ...item };
    },

    async rename(tenantId, itemId, name, renamedAt) {
      const item = rows.get(itemId);
      if (item === undefined || item.tenantId !== tenantId) return "not-found";
      if (nameTaken(tenantId, name, itemId)) return "name-taken";
      const renamed: Item = { ...item, name, updatedAt: renamedAt };
      rows.set(itemId, renamed);
      return { ...renamed };
    },

    all() {
      return [...rows.values()].map((item) => ({ ...item }));
    },

    restore(items) {
      rows.clear();
      for (const item of items) rows.set(item.id, { ...item });
    },
  };
}
