// A real Postgres for the integration tests. DATABASE_URL must point at a throwaway database:
// the tests drop and recreate this module's schema and its bookkeeping table.
import pg from "pg";
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from "../../db/migrate.ts";
import { SAMPLE_SCHEMA } from "../../db/schema.ts";

export function newPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set: the integration tests need a throwaway Postgres.");
  }
  return new pg.Pool({ connectionString: url, max: 4 });
}

export const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

export const MIGRATIONS = `${quote(MIGRATIONS_SCHEMA)}.${quote(MIGRATIONS_TABLE)}`;

/** Drops this module's schema and bookkeeping, and nothing that belongs to another module. */
export async function dropSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`drop schema if exists ${quote(SAMPLE_SCHEMA)} cascade`);
  await pool.query(`drop table if exists ${MIGRATIONS}`);
}
