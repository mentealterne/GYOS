// Use cases for items: load through the port, apply the rule, write through the port.
// The tenant id comes first in every use case (M11).
import type { SampleLogger } from "../../logger.ts";
import { ensureNameIsFree } from "../domain/item-name.ts";
import { duplicateName, itemNotFound } from "../domain/errors.ts";
import type { Item } from "../domain/item.ts";
import type { ItemRepository } from "../ports.ts";

export type { Item };

export interface ItemServiceDeps {
  items: ItemRepository;
  clock: () => Date;
  logger: SampleLogger;
}

export interface ItemService {
  create(tenantId: string, name: string): Promise<Item>;
  list(tenantId: string): Promise<Item[]>;
  rename(tenantId: string, itemId: string, name: string): Promise<Item>;
}

export function createItemService({ items, clock, logger }: ItemServiceDeps): ItemService {
  return {
    async create(tenantId, name) {
      ensureNameIsFree(name, await items.findByName(tenantId, name));
      const created = await items.insert({ tenantId, name, createdAt: clock() });
      // Another request took the name between the check and the write: the unique index decided.
      if (created === "name-taken") throw duplicateName(name);
      logger.debug("item created", { tenantId, itemId: created.id });
      return created;
    },

    list(tenantId) {
      return items.listByTenant(tenantId);
    },

    async rename(tenantId, itemId, name) {
      const item = await items.findById(tenantId, itemId);
      if (item === null) throw itemNotFound(itemId);
      if (item.name === name) return item;
      ensureNameIsFree(name, await items.findByName(tenantId, name), itemId);
      const renamed = await items.rename(tenantId, itemId, name, clock());
      if (renamed === "name-taken") throw duplicateName(name);
      if (renamed === "not-found") throw itemNotFound(itemId);
      logger.debug("item renamed", { tenantId, itemId });
      return renamed;
    },
  };
}
