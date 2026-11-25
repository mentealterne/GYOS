// Rule: an item's name is unique within its tenant.
// The unique index on (tenant_id, name) backs it up when two writes race.
import { duplicateName } from "./errors.ts";
import type { Item } from "./item.ts";

/**
 * Refuses `name` when another item of the same tenant already holds it.
 * `holder` is the item that currently has the name, if any; `itemId` is the item being named.
 */
export function ensureNameIsFree(name: string, holder: Item | null, itemId?: string): void {
  if (holder !== null && holder.id !== itemId) {
    throw duplicateName(name);
  }
}
