// drizzle-kit for this module only. Tooling, not module code: it may read process.env.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["sample"],
  // Bookkeeping in the shared `drizzle` schema, one table per module (see src/db/migrate.ts).
  migrations: { schema: "drizzle", table: "__migrations_sample" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
