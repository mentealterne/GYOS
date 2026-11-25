// Runs this module's migrations. Drizzle's migrator takes no lock, so two processes booting at
// once would race: the run holds a session-level advisory lock on one dedicated connection.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

/**
 * The same key in every module of the workspace, so migrations run one module at a time.
 * Every module's migrator creates the shared `drizzle` schema with CREATE SCHEMA IF NOT EXISTS,
 * which is not safe under concurrency: two modules booting together on a fresh database would
 * otherwise collide on it, and so would two modules creating the same extension.
 * The value is "gyosmig" in ASCII; tooling/architecture checks every module uses it.
 */
export const MIGRATION_LOCK_KEY = 0x67796f736d6967n;

/** Bookkeeping lives in the shared `drizzle` schema, one table per module. */
export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__migrations_sample";

export async function migrateSample(pool: Pool, migrationsFolder: string): Promise<void> {
  const client = await pool.connect(); // one session for the lock and the migration
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query("set lock_timeout = '5s'"); // after the advisory lock, so it can't time out
    await migrate(drizzle({ client }), {
      migrationsFolder,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    client.release(true); // destroy the connection: frees the session lock and the setting
  }
}
