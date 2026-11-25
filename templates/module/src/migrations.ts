// The shipped migrations folder. tsc mirrors src/ into dist/, so "../drizzle" is the same folder
// from src/migrations.ts and from dist/migrations.js. A host that bundles this module passes
// `migrationsFolder` in the config instead.
import { fileURLToPath } from "node:url";

export const SAMPLE_MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));
