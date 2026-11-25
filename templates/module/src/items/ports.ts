// What the items area needs from outside. Types only: the adapters implement them.
import type { Item } from "./domain/item.ts";

export type { Item };

export interface NewItem {
  tenantId: string;
  name: string;
  createdAt: Date;
}

/** Keeps a tenant's items. Every method is scoped to one tenant. */
export interface ItemRepository {
  /** The tenant's items, oldest first. */
  listByTenant(tenantId: string): Promise<Item[]>;
  findById(tenantId: string, itemId: string): Promise<Item | null>;
  findByName(tenantId: string, name: string): Promise<Item | null>;
  /** Stores a new item; "name-taken" when the tenant already has an item with that name. */
  insert(item: NewItem): Promise<Item | "name-taken">;
  /** Renames an item; "name-taken" when another item of the tenant already has that name. */
  rename(
    tenantId: string,
    itemId: string,
    name: string,
    renamedAt: Date,
  ): Promise<Item | "name-taken" | "not-found">;
}
