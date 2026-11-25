// A real Postgres for the integration tests. They drop and recreate this module's schema and its
// bookkeeping table, so they read TEST_DATABASE_URL, never DATABASE_URL (which may point at real
// data), and refuse a database whose name doesn't say it is a throwaway one.
import pg from "pg";
import { MIGRATIONS_SCHEMA, MIGRATIONS_TABLE } from "../../db/migrate.ts";
import { SAMPLE_SCHEMA } from "../../db/schema.ts";

/** The name of a database the integration tests may wipe. */
export const THROWAWAY_DATABASE = /test|verify/i;

/** TEST_DATABASE_URL, once its database name says the tests may wipe it. */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.TEST_DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error(
      'TEST_DATABASE_URL is not set: the integration tests need a throwaway Postgres database, named with "test" or "verify".',
    );
  }
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new Error("TEST_DATABASE_URL is not a postgres:// URL.");
  }
  if (!THROWAWAY_DATABASE.test(name)) {
    throw new Error(
      `TEST_DATABASE_URL points at the database "${name}". The integration tests drop and recreate ` +
        `the sample schema there, so they only run on a database whose name contains "test" or "verify".`,
    );
  }
  return url;
}

export function newPool(): pg.Pool {
  return new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
}

export const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

export const MIGRATIONS = `${quote(MIGRATIONS_SCHEMA)}.${quote(MIGRATIONS_TABLE)}`;

/** Drops this module's schema and bookkeeping, and nothing that belongs to another module. */
export async function dropSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`drop schema if exists ${quote(SAMPLE_SCHEMA)} cascade`);
  await pool.query(`drop table if exists ${MIGRATIONS}`);
}
