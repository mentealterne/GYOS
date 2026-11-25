// `pnpm db:migrate`: runs this module's migrations by hand, the same way ready() does.
// A script, not module code: like drizzle.config.ts it may read process.env.
// Runs with Node's type stripping: node scripts/migrate.ts
import pg from "pg";
import { migrateSample } from "../src/db/migrate.ts";
import { SAMPLE_MIGRATIONS_FOLDER } from "../src/migrations.ts";

const url = process.env.DATABASE_URL;
if (url === undefined || url === "") {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
try {
  await migrateSample(pool, SAMPLE_MIGRATIONS_FOLDER);
  console.log(`Migrated the sample schema from ${SAMPLE_MIGRATIONS_FOLDER}.`);
} finally {
  await pool.end();
}
