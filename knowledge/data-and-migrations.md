# Data and migrations

How a GYOS module owns its data: one Postgres schema, Drizzle, migrations on boot, published views
for lists. Load this for anything that touches the database. The rules themselves are in
`standards/module.md`; this file holds the reasons, the sources and the traps.

Sources were checked on 2026-11-25. Version-dependent details are marked **[version]**.

---

## Versions

**[version] 2026-11-25:**

| Package | Version |
| --- | --- |
| `drizzle-orm` `latest` | 0.45.4 |
| `drizzle-kit` `latest` | 0.31.11 |
| Drizzle v1 `rc` | 1.0.0-rc.6 (2026-11-20) |

**The Drizzle docs site already documents v1.** Its examples use a folder per migration
(`drizzle/<timestamp>_<name>/migration.sql`), while 0.x writes flat files plus
`meta/_journal.json`. Examples copied from the docs may not match the installed version
([Upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1)).

**GYOS pins 0.45 / 0.31** and moves to v1 when it becomes `latest`. `drizzle-kit up` converts the
0.x history.

---

## One schema per module

- **`pgSchema("identity")`** declares the schema; its `.table()` and `.enum()` declare what is in
  it. Queries come out schema-qualified. drizzle-kit generates a bare `CREATE SCHEMA "identity";`
  in the first migration ([Drizzle: schemas](https://orm.drizzle.team/docs/schemas)).
- **One `drizzle.config.ts` per module**, with its own `out` folder
  ([config reference](https://orm.drizzle.team/docs/drizzle-config-file)).
  - `migrations: { table, schema }` defaults to `__drizzle_migrations` in schema `drizzle`, and is
    used by `migrate`, `push` and `pull`.
  - **`schemaFilter` affects `push` and `pull` only, not `generate`.**

**The bookkeeping trap.** Putting the bookkeeping table in the module's own schema looks tidy, but
it doesn't work:
- Drizzle's migrator first runs `CREATE SCHEMA IF NOT EXISTS <migrationsSchema>`. This was checked
  in the source of 0.45.4 and of 1.0.0-rc.6.
- The first generated migration then runs a bare `CREATE SCHEMA "<module>"`. This was checked in
  drizzle-kit 0.31.11 and 1.0.0-rc.6.
- If the two schemas are the same, the first migration fails with
  `schema "<module>" already exists` (SQLSTATE 42P06). **Verified** on 2026-11-25 with
  drizzle-orm 0.45.4 on Postgres 16.

**GYOS's choice:** keep the bookkeeping in the shared `drizzle` schema, one table per module
(`__migrations_<module>`). The alternative is hand-editing the first migration to
`IF NOT EXISTS`, which every new module would have to remember.

---

## Running migrations at runtime

`migrate(db, { migrationsFolder, migrationsTable?, migrationsSchema? })` comes from
`drizzle-orm/node-postgres/migrator` ([Drizzle: migrations](https://orm.drizzle.team/docs/migrations)).
Three facts, all checked in the source:

1. **All pending migrations run in one transaction.**
2. **There is no advisory lock,** in 0.45.4 or in 1.0.0-rc.6. Processes that boot together race.
   A real-world fix wraps the call in a session-level `pg_advisory_lock`
   ([simstudioai/sim#4939](https://github.com/simstudioai/sim/pull/4939)).
   **Verified:** two pools migrating the same module at once, without a lock, failed in 29 of 30
   trials, with unique violations on `pg_class` or `pg_type` as both created the bookkeeping
   table.
3. **`migrationsFolder` is read with plain `fs`,** so a relative path resolves against the current
   working directory, not against the module.
4. **`CREATE SCHEMA IF NOT EXISTS` for the bookkeeping schema runs outside the transaction,** on
   every run. `IF NOT EXISTS` is not concurrency-safe in Postgres: two sessions that create the
   same schema at once fail with a unique violation on `pg_namespace`. **Verified:** 100 of 100
   trials of two concurrent `CREATE SCHEMA IF NOT EXISTS "drizzle"` had one failure; two modules
   with different lock keys booting at once on an empty database failed in 6 of 20 trials, and
   with one shared key in none.

The standard's `migrate<Name>()` follows from these:
- **The lock and the migration share one connection.** A session-level advisory lock belongs to
  the session that took it ([Postgres: advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html)).
- **The lock key is one constant bigint for the whole workspace**, not one per module (fact 4):
  migrations of all modules run one at a time. The shared `drizzle` schema is not the only object
  modules share in a database; two modules creating the same extension would collide the same way.
  Once the migrations are applied, a run only reads the bookkeeping table, so serialising costs
  nothing at boot. `hashtext()` would also work for a key, but it is an undocumented internal
  function.
- **`lock_timeout` is set twice: long before the advisory lock, short after it.** It applies to
  every lock wait, the advisory lock included
  ([Postgres: client config](https://www.postgresql.org/docs/current/runtime-config-client.html)).
  Without a timeout, `pg_advisory_lock` waits forever, so a run stuck in another process would
  hang every boot behind it. The template sets it to `migrationLockTimeoutMs` (60 s by default)
  first, then to 5 s for the migration's own statements. **Verified** on Postgres 16: with the
  lock held in another session and a 200 ms timeout, `ready()` failed after about 200 ms with
  SQLSTATE `55P03` (`lock_not_available`).
- **The connection is destroyed, not returned to the pool,** with `client.release(true)`
  ([node-postgres: pool](https://node-postgres.com/apis/pool)). That drops the session lock and
  the setting together.
- **The folder is an absolute path** resolved from `import.meta.url`.

### Migrations need a session: direct or session-mode connections only

The migration run relies on session state: a session-level advisory lock, `set_config` and `SET`.
A connection pooler in **transaction mode** gives the server connection back to the pool at the
end of each transaction, so that state doesn't survive:

- **PgBouncer** lists "Session-level advisory locks" and `SET`/`RESET` as "Never" compatible with
  transaction pooling ([PgBouncer: features](https://www.pgbouncer.org/features.html)).
- **Neon's pooled connection string** is PgBouncer in `pool_mode=transaction`; Neon lists
  session-level advisory locks and `SET` as not supported on it, and recommends a direct
  connection for schema migrations
  ([Neon: connection pooling](https://neon.com/docs/connect/connection-pooling)).
- **Supabase's transaction-mode pooler** (port 6543) loses session-level state between
  transactions, advisory locks and `set` included; direct connections and session mode keep it
  ([Supabase: connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)).

So the pool a host passes to a module reaches Postgres directly or through a session-mode pooler.
Checked on 2026-11-25; not run against any of these services.

### The out-of-order trap

**[version] Drizzle 0.x**, checked in the source:
- A migration is applied only if its timestamp (`folderMillis`) is later than the last applied
  `created_at`.
- Hashes are not re-checked.

So a migration written on an old branch and merged after a newer one is **silently skipped**. On
one developer's machine everything looks fine; in production a table is missing.

**Drizzle v1** applies every local migration missing from the database, matched by folder name.
It removes `_journal.json`, and its `drizzle-kit check` detects migrations that don't commute
([Upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1)).

**GYOS's guard until v1:** a CI check, in `tooling/architecture`, fails any pull request that adds
a migration older than the newest one on `main`.

### Shipping migrations with the package

- **Bundlers don't copy the migrations folder,** so the package lists it in `files`. Community
  reports of the failure:
  [answeroverflow](https://answeroverflow.com/m/1139193193380978740).
- **The file that resolves the folder sits one level below the package root.** Since `tsc` mirrors
  `src/` into `dist/`, `src/migrations.ts` and `dist/migrations.js` resolve `../drizzle` to the
  same place.
- **A host that bundles the module with esbuild** makes `import.meta.url` point at the host's
  bundle. That host passes `migrationsFolder` in the module's config.

---

## Zero-downtime migrations: expand and contract

**Parallel change.** Most database refactorings go in three steps: expand (add the new shape),
migrate (move data and callers), contract (remove the old shape), each shipped separately
([Fowler: ParallelChange](https://martinfowler.com/bliki/ParallelChange.html),
[Prisma: expand and contract](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern)).

**Why migrations that run on boot must be expand-only.** During a rolling deploy, instances of the
previous version are still running against the migrated schema. A drop, a rename, a type change or
a `SET NOT NULL` breaks them. The contract step ships in a later release.

**Postgres specifics** ([ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)):
- **`ADD COLUMN` with a non-volatile default** does not rewrite the table.
- **A new constraint** is added `NOT VALID`, then validated with `VALIDATE CONSTRAINT` in a later
  step.
- **`CREATE INDEX CONCURRENTLY` can't run inside a transaction block**
  ([CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html)). Drizzle runs every
  pending migration in one transaction, so it can't build an index concurrently. An index on a
  large table is a separate, recorded step, outside the migrator.

**Optional lint.** A CI rule that flags `DROP`, `RENAME`, `ALTER … TYPE` and `SET NOT NULL` in new
migration files, or [squawk](https://squawkhq.com/). Squawk exists but hasn't been evaluated for
GYOS.

---

## Published views

The pattern comes from the production module behind the standard, and is close to what
Jovanović describes as a "read-only view granted to a specific role" (see `modular-monolith.md`).

**When to use it.**
- **For batch reads by id,** a consumer calls the owner's controller.
- **For lists that search, filter, sort, page or count across modules,** an in-memory join of two
  controller calls doesn't scale. The owner publishes read-only views in its own schema, and the
  consumer joins them in its own query.

**The rules:**
- **The views are a closed set,** listed in a recorded decision.
- **Their columns are a contract:** append only, never rename, never drop.
- **No view is built on top of another module's views.** Consumers join them in queries.
- **An architecture test fails** on any view outside the set, and on any view outside the owner's
  schema that reads it.

**Why it is safe:**
- The view is the owner's code, migrated with the owner's schema.
- When the owner's tables change, only the view's definition changes; the contract stays.
- It is the only sanctioned exception to "an adapter never joins another module's tables".

---

## Isolation in the database itself

- **Postgres allows foreign keys across schemas.** Only privileges stop them: a foreign key needs
  the `REFERENCES` privilege, and reading another schema needs `USAGE` on it
  ([Postgres: privileges](https://www.postgresql.org/docs/current/ddl-priv.html)).
- **One role per module,** with privileges only on its own schema and `SELECT` on the published
  views it reads, makes the database itself refuse a stray join.
  ([Jovanović](https://milanjovanovic.tech/blog/how-to-keep-your-data-boundaries-intact-in-a-modular-monolith))
- **The cost** is one connection per module, and transactions that can't span modules. GYOS
  forbids those anyway.

**GYOS's default: off.** Tests enforce the boundary, and the production module behind the standard
made the same call. Turning roles on is recorded as an ADR.

---

## Verified

On 2026-11-25, with drizzle-orm 0.45.4 and drizzle-kit 0.31.11, on Postgres 16 locally and 18 in
CI (`scripts/verify-templates.ts` and throwaway experiments):

- The "schema already exists" failure when the bookkeeping schema equals the module's schema.
- The race without a lock, and the race on the shared `drizzle` schema between modules (facts 2
  and 4 above). With the workspace-wide lock, two pools migrating one module at once apply each
  migration once, and a host awaiting every module's `ready()` at once on an empty database
  succeeds.
- drizzle-kit 0.31 loads a TypeScript `drizzle.config.ts` in a `"type": "module"` package, and
  `generate` and `check` work with it.
- A module named `case-management` gets the schema `"case-management"`; every tier of tests passes
  on it, since Drizzle quotes identifiers. `scripts/verify-templates.ts` scaffolds it on every
  run, so this is re-checked in CI.
- `lock_timeout` bounds the wait in `pg_advisory_lock`: `ready()` fails with `55P03` after the
  configured time while another session holds the lock.
- A Drizzle transaction rolls back every write of a rejected `work`, and a nested one is a
  savepoint (`NodePgTransaction` in drizzle-orm 0.45.4); the contract suite checks the in-memory
  twin does the same.

## Not verified

- Whether `pnpm deploy` honours `files`.
- When Drizzle v1 becomes generally available.
- Whether squawk suits GYOS.
- Migrations through a session-mode pooler (PgBouncer, Supabase), or against Neon.
