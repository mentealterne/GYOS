// What every adapter is built on: the module's Drizzle database, or a transaction opened on it.
// A Drizzle transaction is a database of the same kind, so one type covers both.
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";

export type SampleDatabase = PgDatabase<NodePgQueryResultHKT>;
