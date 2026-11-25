// ItemRepository on Postgres, with Drizzle. Rows are mapped to domain types here, and nowhere else.
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { items, type ItemRow } from "../../db/schema.ts";
import type { Item, ItemRepository } from "../ports.ts";

const UNIQUE_VIOLATION = "23505";

export function createPostgresItemRepository(db: NodePgDatabase): ItemRepository {
  return {
    async listByTenant(tenantId) {
      const rows = await db
        .select()
        .from(items)
        .where(eq(items.tenantId, tenantId))
        .orderBy(asc(items.createdAt), asc(items.id));
      return rows.map(toItem);
    },

    async findById(tenantId, itemId) {
      const [row] = await db
        .select()
        .from(items)
        .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)));
      return row === undefined ? null : toItem(row);
    },

    async findByName(tenantId, name) {
      const [row] = await db
        .select()
        .from(items)
        .where(and(eq(items.tenantId, tenantId), eq(items.name, name)));
      return row === undefined ? null : toItem(row);
    },

    async insert({ tenantId, name, createdAt }) {
      const [row] = await db
        .insert(items)
        .values({ tenantId, name, createdAt, updatedAt: createdAt })
        .onConflictDoNothing({ target: [items.tenantId, items.name] })
        .returning();
      return row === undefined ? "name-taken" : toItem(row);
    },

    async rename(tenantId, itemId, name, renamedAt) {
      try {
        const [row] = await db
          .update(items)
          .set({ name, updatedAt: renamedAt })
          .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)))
          .returning();
        return row === undefined ? "not-found" : toItem(row);
      } catch (error) {
        if (isUniqueViolation(error)) return "name-taken";
        throw error;
      }
    },
  };
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Drizzle wraps driver errors; the Postgres error code is on the error or on its cause. */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}
