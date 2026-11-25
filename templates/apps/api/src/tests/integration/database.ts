// A database of its own for the host's integration tests. The modules' integration tests drop and
// recreate their schemas on TEST_DATABASE_URL, possibly at the same time as these run, so these
// create a fresh database next to it, run every module there, and drop it at the end. That takes
// the CREATEDB privilege, which the Postgres of docker-compose.yml and of CI have.
import pg from "pg";

/**
 * The name of a database the integration tests may wipe: "test" or "verify" as a word of its own,
 * at an end or set off by "_" or "-" (product_test, test-orders, gyos_verify_1), in any case. Not
 * a word inside another: latest, contest and testing are refused.
 */
export const THROWAWAY_DATABASE = /(^|[_-])(test|verify)([_-]|$)/i;

/** TEST_DATABASE_URL, once its database name says the tests may wipe it. */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): URL {
  const value = env.TEST_DATABASE_URL;
  if (value === undefined || value === "") {
    throw new Error(
      'TEST_DATABASE_URL is not set: the integration tests need a throwaway Postgres database, with "test" or "verify" as a word of its name, such as product_test.',
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a postgres:// URL.");
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!THROWAWAY_DATABASE.test(name)) {
    throw new Error(
      `TEST_DATABASE_URL points at the database "${name}". The integration tests create and drop ` +
        `databases next to it, so they only run on a database whose name has "test" or "verify" ` +
        `as a word of its own, set off by "_" or "-": product_test, test-orders, gyos_verify_1.`,
    );
  }
  return url;
}

export interface ScratchDatabase {
  url: string;
  drop(): Promise<void>;
}

/** Creates an empty database named after TEST_DATABASE_URL's, with a suffix of its own. */
export async function createScratchDatabase(suffix: string): Promise<ScratchDatabase> {
  const base = testDatabaseUrl();
  const name = `${decodeURIComponent(base.pathname.replace(/^\//, ""))}_${suffix}_${process.pid}`.slice(0, 63);
  const admin = new pg.Client({ connectionString: base.toString() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${admin.escapeIdentifier(name)} with (force)`);
    await admin.query(`create database ${admin.escapeIdentifier(name)}`);
  } finally {
    await admin.end();
  }
  const url = new URL(base);
  url.pathname = `/${encodeURIComponent(name)}`;
  return {
    url: url.toString(),
    async drop() {
      const client = new pg.Client({ connectionString: base.toString() });
      await client.connect();
      try {
        await client.query(`drop database if exists ${client.escapeIdentifier(name)} with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
