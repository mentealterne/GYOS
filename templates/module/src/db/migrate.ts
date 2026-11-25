// Runs this module's migrations. Drizzle's migrator takes no lock, so two processes booting at
// once would race: the run holds a session-level advisory lock on one dedicated connection. That
// connection must be a real session: a direct one, or a pooler in session mode. A pooler in
// transaction mode (PgBouncer's, Neon's and Supabase's pooled URLs) drops session locks.
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

/** How long a migration statement waits for a table lock that serving traffic holds. */
const STATEMENT_LOCK_TIMEOUT = "5s";
/** SQLSTATE lock_not_available: lock_timeout expired. */
const LOCK_NOT_AVAILABLE = "55P03";

export interface MigrateOptions {
  /** How long to wait for the migration lock while another run, of any module, holds it. */
  lockTimeoutMs: number;
}

export async function migrateSample(
  pool: Pool,
  migrationsFolder: string,
  { lockTimeoutMs }: MigrateOptions,
): Promise<void> {
  const client = await pool.connect(); // one session for the lock and the migration
  try {
    // lock_timeout bounds the wait for the advisory lock too: a run stuck elsewhere fails this
    // boot, with a message that says so, instead of hanging it.
    await client.query("select set_config('lock_timeout', $1, false)", [`${lockTimeoutMs}ms`]);
    try {
      await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    } catch (error) {
      if ((error as { code?: unknown }).code !== LOCK_NOT_AVAILABLE) throw error;
      throw new Error(
        `Waited ${lockTimeoutMs} ms for the migration lock: another process is migrating this ` +
          "database, or holds the lock without finishing.",
        { cause: error },
      );
    }
    // Then the shorter wait for the migration's own statements.
    await client.query(`set lock_timeout = '${STATEMENT_LOCK_TIMEOUT}'`);
    await migrate(drizzle({ client }), {
      migrationsFolder,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    client.release(true); // destroy the connection: frees the session lock and the settings
  }
}
