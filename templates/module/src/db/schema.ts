// This module's Postgres schema and every table in it. No foreign key leaves the schema (M7).
// After a change here, run `pnpm db:generate` and commit the new migration in ./drizzle.
import { pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const SAMPLE_SCHEMA = "sample";

export const schema = pgSchema(SAMPLE_SCHEMA);

/** The unique index behind "an item's name is unique within its tenant". */
export const ITEMS_TENANT_NAME_KEY = "items_tenant_id_name_key";

export const items = schema.table(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Owned by whoever owns tenants: a plain column, never a foreign key. */
    tenantId: text("tenant_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex(ITEMS_TENANT_NAME_KEY).on(table.tenantId, table.name)],
);

export type ItemRow = typeof items.$inferSelect;
