# Standard: domain module

The shape of every domain module GYOS generates, and the rules it keeps. GYOS's templates, the
`/gyos:context` skill and `/gyos:doctor` all follow this file. Change the standard here first,
then the templates. The reasons and sources behind it are in `knowledge/ports-and-adapters.md`,
`knowledge/data-and-migrations.md`, `knowledge/modular-monolith.md` and
`knowledge/packaging-and-build.md`.

The template that implements this standard is `templates/module`, and
`scripts/verify-templates.ts` proves it: it scaffolds two modules into a throwaway workspace and
runs every check below on them, in CI too. A statement here marked **verified** was run that way,
not only read in documentation.

The shape is taken from a production module that went through a long series of changes and
schema migrations: an identity module consumed in-process by several apps. Its rules are
**decisions, not observations**. Each one is here because something broke, or would have broken,
without it. Where GYOS departs from that module (Drizzle instead of Kysely, `tsc` instead of
esbuild, a dedicated export condition), the reason is given in place.

Versions were checked on 2026-11-25. Details that depend on a version are marked **[version]**.

---

## What a module is

A module is the code of **one bounded context**:

- It lives in `modules/<name>/` and is the workspace package `@module/<name>`. `<name>` is
  kebab-case, preferably one word.
- It is an **ESM package that ships a build**, compiled with `tsc`.
- It **owns one Postgres schema**, named after it, and migrates that schema itself. A
  multi-word name gives a schema such as `"case-management"`: Drizzle always quotes it, and
  hand-written SQL must too (verified).
- Apps consume it **in-process**, through its public entry points. There is no HTTP between
  modules: the product is a modular monolith.
- Inside, it is **ports and adapters**. Pure rules sit in the middle, use cases around them, and
  every piece of I/O behind an interface that the host fills in.

---

## The tree

```
modules/<name>/
├── package.json            exports: ".", "./contracts", the vocabulary subpaths
├── tsconfig.json           typecheck only: src (tests included), features, scripts, the config files
├── tsconfig.build.json     build: src → dist with declarations; rootDir ./src, src/tests excluded
├── drizzle.config.ts       drizzle-kit, this module's schema only
├── drizzle/                generated SQL migrations; shipped with the package
├── vitest.config.ts        unit and architecture tests: src/tests/unit/**/*.test.ts
├── vitest.config.integration.ts  integration tests: src/tests/integration/**/*.test.ts
├── cucumber.mjs            loads tsx-register.js, then features/support and features/steps
├── tsx-register.js
├── scripts/migrate.ts      `db:migrate`: runs the migrations by hand. Tooling, like drizzle.config.ts
├── features/               scenarios: *.feature, steps/, support/ (world, hooks, in-memory adapters)
└── src/
    ├── index.ts            create<Name>Module(config): the module's factory
    ├── contracts.ts        types, ports a host implements, errors as types. No runtime code
    ├── repositories.ts     builds every adapter on its connection, and the transaction seam
    ├── migrations.ts       the migrations folder, resolved the same from src/ and dist/
    ├── module-controllers/ the operations hosts call: parse input, delegate
    │   ├── index.ts        builds the use cases and controllers on a set of repositories
    │   └── input-error.ts  is<Name>InputError(), exported from the root entry
    ├── <area>/
    │   ├── domain/         pure rules
    │   ├── services/       use cases: load through ports, apply rules, write through ports
    │   ├── ports.ts        what the area needs from outside
    │   └── adapters/       how that is provided: the only code that does I/O
    ├── <vocabulary>.ts     published language: constants, unions, zod schemas. No I/O
    ├── db/                 the schema (pgSchema + tables), the database type, the migration runner
    ├── config/             the configuration contract and its validation
    ├── logger.ts           the logger port and the fallback
    └── tests/
        ├── contract/       what every set of repositories promises, run by both tiers below
        ├── unit/           no database: domain, services, controllers, architecture
        └── integration/    adapters against a real Postgres
```

`module-controllers/index.ts` is the wiring shared by `index.ts` (with the Postgres adapters) and
by the scenarios and unit tests (with the in-memory ones), so the two cannot drift apart.

**Areas.** A module has one or more areas: the parts of the bounded context that change for
different reasons, for example `authentication`, `account` and `company` inside an identity
module. A new module starts with one area, named after its main concept. This standard says
"area", not "subdomain", because GYOS's knowledge base uses "subdomain" in the strategic DDD
sense (core, supporting, generic).

---

## The layers

```
host (apps/api route, a worker job, a script)     main.ts is the composition root
  ↓  imports @module/<name>  (or /contracts for types only)
index.ts — create<Name>Module(config)            the module's factory
  ↓
module-controllers/*.controller.ts               driving side: parse input, call one use case
  ↓
<area>/services/                                 use cases; receive ports, build no queries
  ↓                      ↘
<area>/domain/           <area>/ports.ts          driven side: what the module needs
pure rules                 ↑ implemented by
                         <area>/adapters/         Drizzle, queues, outside APIs
```

**Layers are not skipped.** A controller doesn't query. A service doesn't import an adapter or a
database handle. A host doesn't import anything below the published entry points.

| Part | Holds | May import | Never imports |
| --- | --- | --- | --- |
| `index.ts` | The factory and the config contract | Everything it wires | Below another module's entry points |
| `contracts.ts` | Types, ports and errors (as types) that consumers code against | Types only, from the module and from other modules' entry points | Any implementation |
| `module-controllers/` | The operations, with input parsing | Other controllers, services, the vocabulary, zod | Adapters, `db/`, any other package (transport types included), Node built-ins |
| `<area>/domain/` | Pure rules: no I/O, no clock, no logger | The vocabulary, its own `domain/` | Anything else: packages (zod included), Node built-ins, other areas |
| `<area>/services/` | Use cases | Its own `domain/` and `services/`, any `ports.ts`, the vocabulary, the logger port; other modules' entry points as types | `adapters/`, `db/`, any package (Drizzle, `pg`), Node built-ins, other areas' `domain/` and `services/` |
| `<area>/ports.ts` | Interfaces: repositories, notifiers, outside systems | Types only: any `ports.ts`, its own `domain/`, the vocabulary; other modules' entry points as types | Any implementation |
| `<area>/adapters/` | Implementations of the ports, and mapping rows to domain types | Its own `ports.ts`, `domain/` and `adapters/`, the vocabulary, `db/`, the logger port, any package (Drizzle, `pg`, an outside SDK, another module's entry points), Node built-ins | `services/`, another area's `adapters/`, `ports.ts` or `domain/` |
| `<vocabulary>.ts` | The module's published language | zod, the vocabulary (its other files) | Anything with I/O |
| `repositories.ts` | Builds every adapter on the connection | Adapters, any `ports.ts`, `db/`, Drizzle, `pg` | Services, controllers, other modules |
| `db/` | The schema and the migration runner | Its own files, the vocabulary (for an enum built from a published union), Drizzle, `pg`, Node built-ins | Anything else in the module |
| `config/` | The configuration contract | Its own files, the logger port, `migrations.ts`, any `ports.ts` (types), `pg`, Node built-ins; other modules' entry points as types | Adapters, services |
| `logger.ts` | The logger port and the fallback | Nothing | Everything |
| `migrations.ts` | The migrations folder | Node built-ins | Everything else |

**Other modules (M10).** Wherever a row allows "the vocabulary", a module that conforms to another
module's language may also import that module's vocabulary subpaths, as values: the domain
applies its constants, a controller parses with its schemas, `db/` builds an enum from its union.
"As types" means `import type` or `export type … from`: with `verbatimModuleSyntax`,
`import { type X }` keeps the import at runtime, so it counts as a value import. No part imports
below another module's entry points, `index.ts` included.

The architecture tests read this table as an **allow-list**: an import that no row allows is a
violation. Next to every rule there is a synthetic import that breaks it, and next to every
allowance one that uses it. `src/tests/` is not checked.

**Areas talk through ports and rules, never through each other's adapters.**

Only adapters touch the database, along with `db/` itself and the composition in
`repositories.ts` and `index.ts`.

**Naming.**
- **Ports** are named for their purpose: `InvoiceNotifier`, `SessionStore`.
- **Adapters** are named for their purpose plus their technology:
  `invoice-notifier.email.ts`, `session-store.postgres.ts`.

Swapping a technology then means adding a file next to the old one and changing one line in
`repositories.ts` or `index.ts`.

---

## Invariants

**M1. One factory per module; the host is the composition root.**
`create<Name>Module(config)` is the module's facade:
- it resolves the config;
- it opens nothing of its own;
- it builds the adapters on the injected connection;
- it returns the controllers and `ready()`, which migrates the module's schema (M8).

A host calls it **once per process** and keeps the result. The host's `main.ts` is the
composition root: it builds the pool and the logger, builds every module, and wires the junctions.
_Trap:_ building the module per request means building a new set of repositories on every call.

**M2. The module owns no transport.**
No Express, no `Request`/`Response`, no framework types in the root entry. The host maps HTTP,
jobs or CLI arguments onto controller calls.
_Trap:_ one framework type in a signature makes the module importable by exactly one kind of
consumer.

**M3. Nothing is constructed at import time.**
Construction happens inside the factory body.
_Trap:_ a module-scope database handle runs on import in every consumer, tests and builds
included. It is also what makes `sideEffects: false` true.

**M4. Every dependency is injected.**
The connection pool, the logger, the clock, queues, notifiers and outside clients come in through
the config. None of them is a module-scope import, and there is no container: factories and
closures, checked by the compiler.
_Why:_ it is what lets the scenarios run against plain in-memory objects, with no mocking
library, and what lets an adapter be swapped without touching a service.

**M5. Only adapters do I/O.**
Every query lives in `<area>/adapters/`. Services receive the ports.
_Trap:_ a Drizzle call in a service is a place the next schema change will have to find by hand.

**M6. Configuration is validated at startup, all at once.**
`src/config/<name>-config.ts` holds two types and one function:
- an input type, where every tunable is optional;
- a resolved type, where nothing is optional;
- `resolve<Name>Config(config)`, which layers the defaults and throws `<Name>ConfigError`
  listing **every** problem, not just the first.

Nothing under `src/` reads `process.env`: the host reads the environment and passes the values
in. Tooling at the module's root (`drizzle.config.ts`, `scripts/`) may read it, and so may the
integration tests. An architecture test fails on any other read, however it is spelled:
`process["env"]`, `const { env } = process`, `import { env } from "node:process"` included.
_Why:_ bad configuration fails at boot, not at somebody's first request, and the person fixing
it sees every problem in one restart, not one per restart.

**M7. The module owns its schema, and nothing outside it.**
- Its tables live in its own Postgres schema (`pgSchema("<name>")`).
- No foreign key leaves the schema: an id that belongs to another module is a plain column.
- An adapter never joins another module's tables.
- The only sanctioned cross-schema read is another module's **published views** (below).

_Trap:_ a casual cross-schema join today is a blocker the day the boundary moves.

**M8. The module migrates its own schema, expand-only.**
`ready()` runs the module's migrations once per module instance, which M1 makes once per process.
The memo lives in the factory's closure, not at module scope (M3). Runs in flight are shared, and
a rejected run is forgotten, whatever rejected it (the "ready" log line included), so that the
next call retries it. Every host awaits `ready()` for every
module before it serves a request or runs a job, and may await them all at once: migrations of
all modules are serialised by one advisory lock (see Data).

Migrations are **expand-only**, because new code migrates while instances of the old version are
still serving. That rules out `DROP`, `RENAME`, type changes and `SET NOT NULL` in the same deploy
as the code that needs them. Contraction is a later, separate deploy.

**M9. The contract carries no implementation.**
`contracts.ts` re-exports types only, and the module's error classes appear there as types. A
consumer that catches an error with `instanceof` imports the class from the root entry.
_Why:_
- any code can import the contract, browser code included, without pulling in the module's
  runtime;
- the same contract could later be served over another transport without changing a consumer.

**M10. Modules depend on each other one way.**
- **By default**, a module that needs something from another **declares a port in its own
  language**, and the host implements that port by calling the other module. The dependency then
  lives in the composition root, which is also where junctions belong (see below).
- **When a module deliberately conforms to another's language**, it may import that module
  directly. It does so through declared entry points only, lists the dependency in its own
  `package.json`, and receives the instance through its config.
- **Always:** no cycles. The architecture tests check every one of these rules.

The compiler is the first line of enforcement:
- **`module: "nodenext"`.** TypeScript honours `exports`, so a deep import fails to resolve.
- **No tsconfig `paths`.** `paths` bypass `exports`, and Node's type stripping ignores them.
  Imports inside a module are relative, with `.ts` extensions, rewritten to `.js` by
  `rewriteRelativeImportExtensions`. The emitted `.d.ts` files keep the `.ts` specifiers, and
  TypeScript resolves them to the sibling `.d.ts`: a consumer built against `dist` typechecks
  with `skipLibCheck` off (verified, TypeScript 7.0.2).
- **pnpm doesn't hoist undeclared dependencies,** so importing a module that isn't in
  `package.json` fails.

**M11. In a multi-tenant product, the tenant comes first.**
Every use case takes the tenant id as its first argument.
_Why:_ when the tenant is optional, a caller can forget the tenant filter; when it is the first
argument, leaving it out doesn't compile.

**M12. The surface grows with use cases, not in anticipation of them.**
An operation is added when a caller needs it, and not before.
_Trap:_ every capability a module could plausibly own will be asked for before anyone has decided
it belongs there.

---

## Configuration and dependency injection

```ts
// src/config/billing-config.ts
export interface BillingModuleConfig {
  /** The host's pool. The module builds on it and never opens or ends one. */
  db: Pool;
  /** Where log lines go. Without one, only warnings and errors reach stderr. */
  logger?: BillingLogger;
  /** Now. Injected so that rules about time can be tested. Defaults to () => new Date(). */
  clock?: () => Date;
  /** A port the host implements: how the product tells a customer an invoice is due. */
  invoiceNotifier?: InvoiceNotifier;
  /** Only for a host that bundles this module: where the shipped migrations folder is. */
  migrationsFolder?: string;
  /** How long ready() waits for the workspace's migration lock. Defaults to 60 000 ms. */
  migrationLockTimeoutMs?: number;
}

export interface ResolvedBillingConfig {
  db: Pool;
  logger: BillingLogger;
  clock: () => Date;
  invoiceNotifier: InvoiceNotifier | null;
  migrationsFolder: string;
  migrationLockTimeoutMs: number;
}
```

**An optional port that the use case needs** is checked when the use case runs, before anything
is written. The module throws `<Port>MissingError`, so a request is never recorded without
anybody being told.

**Per-request things** (a transaction, a request-scoped logger) are passed as arguments, not
through the config.

---

## Errors

- **Expected business refusals** are typed error classes with a `code` union, for example
  `InvoiceAccessError` with `code: "not-found" | "already-paid"`. Services throw them, and the root
  entry exports them.
- **Invalid input** is the `ZodError` thrown by the controller's parse. The root entry exports
  `is<Name>InputError(error)` (`module-controllers/input-error.ts`), an `instanceof` check against
  the module's own zod, so a host maps invalid input without importing zod or knowing the module
  uses it. The smoke host in `scripts/verify-templates.ts` calls it from source and from the build.
- **The host maps them** to HTTP statuses, job outcomes or CLI exit codes. The module never
  produces an HTTP error.
- **Anything else is a bug** and is thrown as a plain error.
- **A port reports an expected outcome as a value**, not an exception: an adapter returns
  `"name-taken"` when the unique index behind that rule refuses a write, and the service turns it
  into the typed error. A rule checked before the write can still lose a race; the index is the
  backstop. The adapter checks the index by name (`error.constraint`, exported from
  `db/schema.ts`): a violation of any other index is a bug, and is thrown.

A `Result` type is an accepted alternative for a team that prefers it. If a team chooses it, the
choice is recorded in an ADR and applied to every module.

---

## The logger

Each module declares the subset of a logger it uses, and nothing more:

```ts
// src/logger.ts
export interface BillingLogger {
  error(message: string | Error, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): BillingLogger;
}
```

- **The factory calls `child({ module: "billing" })` once on the resolved logger** (the injected
  one, or the fallback), so every line the module writes carries its name.
- **Without an injected logger, only warnings and errors reach stderr.** A library documents its
  logging and doesn't configure output for the application. The fallback implements the whole
  port, `child()` included.
- **The real logger is chosen at setup:** pino, pino with OpenTelemetry, or the team's own. The
  host builds it once and injects it into every module.
- **The module never depends on a logging library.** The adapter from pino to the port is a few
  lines in the host.
- **One line at bootstrap** says the module is ready. A module that works correctly is otherwise
  silent, so this line is the cheapest way to answer "is it loaded?" from the logs alone.

---

## Data: schema, migrations, published views

**[version] Drizzle.** The pinned versions are `drizzle-orm` 0.45 and `drizzle-kit` 0.31. Version 1
is a release candidate; the docs site already documents it, with a different migrations layout.
GYOS moves to version 1 when it becomes `latest`, with `drizzle-kit up` to convert the history.

**The schema.** `src/db/schema.ts` declares `export const BILLING_SCHEMA = "billing"`,
`export const schema = pgSchema(BILLING_SCHEMA)` and every table on it. The schema name is a
constant used everywhere; nothing else in `src/` hard-codes it. (The variable is not called
`billing`: a scaffolded `case-management` would not be a valid identifier.)

**drizzle-kit, one module at a time.** Each module has its own `drizzle.config.ts`:

```ts
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["billing"],
  // Bookkeeping in the shared `drizzle` schema, one table per module (see below).
  migrations: { schema: "drizzle", table: "__migrations_billing" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- **`drizzle.config.ts` may read `process.env`.** It is tooling that runs on a developer's machine
  or in CI. M6 applies to `src/`. drizzle-kit 0.31 loads this TypeScript config, and the schema it
  points at, in a `"type": "module"` package (verified).
- **`schemaFilter` only affects `push` and `pull`,** not `generate`.
- **Each module's bookkeeping is its own table in a shared `drizzle` schema, not a table in the
  module's schema.** The migrator runs `CREATE SCHEMA IF NOT EXISTS` on the bookkeeping schema
  before anything else, and the first generated migration runs a bare `CREATE SCHEMA "billing"`.
  With the bookkeeping in the module's own schema, the first migration fails with
  `schema "billing" already exists` (42P06) (verified).

**Running migrations.** Drizzle's migrator applies every pending migration in one transaction, but
**it takes no lock** **[version: 0.45, and 1.0 rc]**. Two processes booting at once race: without
a lock, one of two concurrent runs failed in 29 of 30 trials, on the creation of the bookkeeping
table (verified). `ready()` therefore holds a session-level advisory lock on a dedicated
connection.

**One lock key for the whole workspace, not one per module.** Every module's migrator also runs
`CREATE SCHEMA IF NOT EXISTS "drizzle"`, outside its transaction, and `IF NOT EXISTS` is not safe
under concurrency: two sessions creating the same schema at once fail with a unique violation on
`pg_namespace` (100 of 100 trials). With one key per module, two modules booting together on an
empty database collided in 6 of 20 trials; with one shared key, in none (verified). The same
holds for anything else modules share in the database, such as `CREATE EXTENSION`. Migrations of
all modules therefore run one at a time, which costs nothing at boot once they are applied.
`tooling/architecture` checks that every module uses the same key.

```ts
// src/db/migrate.ts
/** The same key in every module of the workspace ("gyosmig" in ASCII). */
export const MIGRATION_LOCK_KEY = 0x67796f736d6967n;
export const MIGRATIONS_SCHEMA = "drizzle";
export const MIGRATIONS_TABLE = "__migrations_billing";

export async function migrateBilling(
  pool: Pool,
  migrationsFolder: string,
  { lockTimeoutMs }: { lockTimeoutMs: number },
): Promise<void> {
  const client = await pool.connect(); // one session for the lock and the migration
  try {
    // A long wait for the lock, then a short one for each migration statement.
    await client.query("select set_config('lock_timeout', $1, false)", [`${lockTimeoutMs}ms`]);
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]); // 55P03: "Waited … ms"
    await client.query("set lock_timeout = '5s'");
    await migrate(drizzle({ client }), {
      migrationsFolder,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    });
  } finally {
    client.release(true); // destroy the connection: frees the session lock and the settings
  }
}
```

**The wait for the lock is bounded.** `lock_timeout` applies to advisory locks too, so it is set
to `migrationLockTimeoutMs` (config, default 60 000 ms) before `pg_advisory_lock`: a run stuck
elsewhere makes `ready()` fail with a message that says so, instead of hanging the boot. The
timeout is then lowered to 5 s for the migration's own statements. An integration test holds the
lock in another session and expects the failure within the timeout (verified, Postgres 16).

**Migrations need a real session.** The advisory lock, `set_config` and `SET` belong to the
session, so `ready()` and `db:migrate` need a direct connection or a pooler in session mode. A
pooler in transaction mode (PgBouncer's `pool_mode=transaction`, the pooled connection strings of
Neon and Supabase) can hand each transaction to a different server connection, and doesn't
support session-level advisory locks. The pool a host passes as `db` therefore reaches Postgres
directly or through a session-mode pooler; the sources are in `knowledge/data-and-migrations.md`.

The `db:migrate` script, `scripts/migrate.ts` at the module's root, runs the same function by
hand. It lives outside `src/` because it reads `DATABASE_URL`, and runs with Node's type
stripping: `node --conditions=@gyos/source scripts/migrate.ts` (verified).

**[version] The out-of-order trap in Drizzle 0.x.** A migration is applied only if its timestamp
is later than the last one applied, and hashes are not re-checked. A migration written on an old
branch and merged later is therefore **skipped without a word**. Until version 1, which applies
every missing migration by name, a CI check fails any pull request that adds a migration older
than the newest one on `main`. That check is not built yet (a `todo` in `tooling/architecture`);
meanwhile each module's architecture test fails when the journal's timestamps don't increase
with its order, which is what a hand-merged journal looks like.

**Shipping the migrations.**
- The migrator reads `drizzle/` with plain `fs` at runtime, so the folder is listed in
  `package.json` `files`.
- `src/migrations.ts` resolves the folder as `fileURLToPath(new URL("../drizzle", import.meta.url))`.
  Because `tsc` mirrors `src/` into `dist/`, that path is the same from `src/migrations.ts` and from
  `dist/migrations.js`. A unit test checks that it resolves.
- A host that bundles the module changes what `import.meta.url` points at. That host passes
  `migrationsFolder` in the config.

**What a boot migration can't do.** Drizzle wraps the migrations in a transaction, and
`CREATE INDEX CONCURRENTLY` cannot run inside one. An index on a large table is built by a
separate, recorded step, outside the migrator.

**Published views: the read API for lists.**
- **For batch reads by id,** a consumer calls the owner's controller.
- **For lists that search, filter, sort, page or count by another module's data,** the owner
  publishes read-only views in its own schema, and consumers join them in their own queries.

The views are a **closed set**, and their columns are a contract:
- a new need becomes an appended column first;
- a column is never renamed or dropped;
- a new view needs a recorded decision;
- no view is built on top of another module's views.

An architecture test fails on any view that is not in the set.

**Transactions inside a module.** `repositories.ts` builds `transaction(work)` on
`db.transaction((tx) => work(create<Name>Repositories(tx)))`: `work` gets every repository bound
to one transaction, its writes commit when it resolves and none remains when it rejects, and a
nested call is a savepoint. Adapters are built on `<Name>Database` (`src/db/database.ts`), which
covers both the database and a transaction on it. A use case whose writes must land together
receives `transaction` and writes only through the repositories it is given. The in-memory twin
in `features/support/` rolls back the same way, and the contract suite checks that both do.

**No transaction spans two modules.** A rule that has to change two modules is a junction. The
host orchestrates it, through operations that are safe to retry.

**When a reaction must survive a crash,** the emitting module writes the event to an outbox table
in its own schema, in the same transaction as the change. A relay delivers it at least once, so
handlers are idempotent: they record the ids they have processed. Fire-and-forget handlers lose
events. The outbox arrives with the first junction that needs it, not before.

**Database roles per module are optional hardening.** One Postgres role per module, with `USAGE`
only on its own schema, makes the database refuse cross-schema access. It also means one
connection per module. The default relies on the tests above and records that choice in an ADR.

---

## Junctions

Some rules belong to no single module: "when an assessment is complete, book a restitution
meeting" belongs to neither assessments nor calendar. For each junction:

1. it is **named**;
2. it is **declared to belong to neither module**;
3. its owner is **settled once**: by default, the host's composition root, where one module's
   port is implemented with a call to the other;
4. it is **documented once**, in the Junctions section of `docs/context-map.md`.

---

## Packaging and build

**The module ships a build, not raw TypeScript.** Node refuses to strip types from files under
`node_modules`, and a production install must bring the module's own dependencies with it. So
`default` points at `dist/`, and a dedicated condition points at `src/` for the dev loop.

```json
{
  "name": "@module/billing",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "@gyos/source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./contracts": {
      "@gyos/source": "./src/contracts.ts",
      "types": "./dist/contracts.d.ts",
      "default": "./dist/contracts.js"
    }
  },
  "files": ["dist", "src", "drizzle"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:scenarios": "NODE_OPTIONS=--conditions=@gyos/source cucumber-js",
    "test:integration": "vitest run -c vitest.config.integration.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node --conditions=@gyos/source scripts/migrate.ts",
    "db:check": "drizzle-kit check"
  }
}
```

- **Every vocabulary file is an export of its own,** with the same three conditions:
  `"./items": { "@gyos/source": "./src/items-vocabulary.ts", … }`.
- **`@types/pg` is a dependency, not a dev dependency,** because the shipped `.d.ts` mention
  `Pool`.
- **Versions come from the workspace's pnpm catalog** (`"drizzle-orm": "catalog:"`), so every
  module uses the same ones, and `pg` resolves to one instance for the host and all modules.
- **[version] No `lint` script yet.** typescript-eslint needs a TypeScript JS API, which
  TypeScript 7.0 doesn't have. The workspace's `typescript` alias to `@typescript/typescript6`
  (below) should satisfy its peer dependency, but that is **not verified**; ESLint arrives with
  its own template.

**`@gyos/source`, not `development`.** The condition comes first, and its name is unique to GYOS.
A generic `development` condition also matches third-party packages that ship development builds,
so turning it on would switch them too. Each tool turns `@gyos/source` on in its own way:

| Tool | How |
| --- | --- |
| TypeScript | `customConditions: ["@gyos/source"]` in the base tsconfig; `[]` in `tsconfig.build.json` |
| Node | `--conditions=@gyos/source`, or `NODE_OPTIONS=--conditions=@gyos/source` for a tool that starts Node itself (Cucumber) |
| Vitest | `ssr.resolve.conditions: ["@gyos/source", "module", "node", "development\|production"]` |
| Vite (browser builds) | `resolve.conditions: ["@gyos/source", "module", "browser", "development\|production"]` (not tried yet) |

- **Vitest runs tests in Vite's server environment.** `resolve.conditions` alone is not used
  there: a test importing another module failed to resolve it until the condition was in
  `ssr.resolve.conditions` (verified, Vitest 5.1 with Vite 8.3). Setting the list replaces Vite's
  defaults, so they are repeated after it.
- **Without the condition, an import of another module resolves to its `dist/`,** which exists
  only after a build. That is why the scenarios and `db:migrate` turn it on (verified for the
  scenarios: without it, support code importing a workspace package failed before a build).
- **The build turns it off** (`customConditions: []`), so a module builds against its
  dependencies' declarations, as consumers in production do. That is what `^build` in
  `turbo.json` is for.

**The build is `tsc`** **[version]**:
- It emits JavaScript and declarations, file for file.
- Turborepo recommends it for internal packages and advises against project references.
- In `turbo.json`, `build` depends on `^build` and outputs `dist/**`. `test:integration` is not
  cached and lists `TEST_DATABASE_URL` in `passThroughEnv`: Turborepo 2 hides undeclared environment
  variables from tasks.
- **`typecheck`, `test:unit` and `test:scenarios` depend on a `transit` task** that depends on
  `^transit` and matches no script. Through `@gyos/source` a package compiles its dependencies'
  source, which is not in its own hash: without the transit task, a dependent replayed a cached
  pass after a breaking change in a dependency (verified, Turborepo 2.11). `transit` puts the
  dependencies' files in the hash and still lets the tasks run in parallel.
- **`tooling/architecture` reads every module from disk** but depends on none, so its own
  `turbo.json` adds `$TURBO_ROOT$/modules/**` and `$TURBO_ROOT$/apps/**` to the inputs of
  `test:unit`, minus what it skips (`node_modules`, `dist`, `reports`, `.turbo`, `coverage`).
- `tsconfig.base.json` is a `globalDependencies` entry: a change to it invalidates every task.
- `scripts/verify-templates.ts` breaks a dependency, then a module, after a first run, and
  expects the cached task to fail.
- esbuild emits no declarations and no type check. tsup is unmaintained.

**The base tsconfig** (`tsconfig.base.json` at the workspace root) **[version: TypeScript 7.0]**:

| Option | Value |
| --- | --- |
| `module` | `"nodenext"` |
| `verbatimModuleSyntax` | `true` |
| `erasableSyntaxOnly` | `true` |
| `rewriteRelativeImportExtensions` | `true` |
| `customConditions` | `["@gyos/source"]` |
| `declaration`, `declarationMap` | `true` |
| `types` | `["node"]` |
| `strict` | `true` |

The template's base also sets `target: "es2024"`, `sourceMap`, `noUncheckedIndexedAccess`,
`noImplicitOverride` and `skipLibCheck`. Those are defaults a team may change; the table above is
what the standard relies on.

**`rootDir` and `outDir` are not in the base.** A relative path in a shared base resolves against
the base file, not against the package that extends it. Each package's `tsconfig.build.json`
sets `rootDir: "./src"` and `outDir: "./dist"`, includes `src` and excludes `src/tests`. The
package's `tsconfig.json` only typechecks (`noEmit`) and includes everything else too: `features`
and the unit tests import each other, so one `rootDir` can't cover them.

TypeScript 6.0 changed three defaults, which 7 keeps, and which these files make explicit:
- `types` is now `[]`;
- `rootDir` defaults to the directory of the `tsconfig.json`;
- `strict` is on by default.

**[version] TypeScript 7 and 6 side by side.** The workspace aliases `"typescript"` to
`npm:@typescript/typescript6` and `"@typescript/native"` to `npm:typescript@^7`, as the
TypeScript 7.0 announcement recommends: `tsc` is TypeScript 7, and code that imports
`"typescript"` (the architecture tests, later typescript-eslint) gets the 6 API (verified:
`tsc` 7.0.2, API 6.0.3).

**Erasable syntax only.** No `enum`, no parameter properties, no `namespace`. Use `as const`
objects with union types, and factory functions rather than classes. This keeps every file
runnable by Node's type stripping, and stable since Node 24.12. The dev loop runs
`node --conditions=@gyos/source apps/api/src/main.ts` with no build step: Node follows pnpm's
workspace symlink to the module's real path, outside `node_modules`, and strips its types
(verified on Node 24.6 with a host importing two modules).

**[version] Node 24 LTS** is the baseline. Cucumber 13 needs Node 22, 24 or ≥ 26, and the
OpenTelemetry JS SDK 3 needs ≥ 22.15.

---

## Testing

| Tier | Where | Runs against | Proves |
| --- | --- | --- | --- |
| **Unit** | `src/tests/unit/` | In-memory ports, no database | Domain rules, use cases, controller parsing, config validation, the repositories' contract on the in-memory twin |
| **Architecture** | `src/tests/unit/architecture/` | The source's imports | The layer rules above; contracts and ports hold types only; no `process.env`; the exports; the migrations folder resolves |
| **Scenarios** | `features/` | The controllers, with the in-memory adapters from `features/support/` | The product promises, in the language of the people who use it |
| **Integration** | `src/tests/integration/` | Adapters on a real, throwaway Postgres (`TEST_DATABASE_URL`) | The repositories' contract, queries, mapping, the unique indexes, transactions, migrations (two pools at once included), the published views |

- **Two Vitest configs.** `vitest.config.ts` includes only `src/tests/unit/**/*.test.ts`, so
  `test:unit` never needs a database; `vitest.config.integration.ts` includes only
  `src/tests/integration/**/*.test.ts` and runs the files one at a time
  (`fileParallelism: false`), because they share the module's schema.
- **The integration tests isolate themselves by schema.** They drop and recreate the module's own
  schema and bookkeeping table, never anything else, so the modules of a workspace can run theirs
  at the same time on one database.
- **They read `TEST_DATABASE_URL`, never `DATABASE_URL`,** and refuse to run unless the
  database's name contains `test` or `verify`: a test run that drops a schema must not be one
  mistyped variable away from real data. A unit test checks the refusal, and
  `scripts/verify-templates.ts` runs it on a database called `postgres`.
- **One set of in-memory adapters** in `features/support/` serves both the scenarios and the unit
  tests, so a phrase like "Giulia is an HR director" means the same thing everywhere. They keep
  the same promises as the real adapters, unique indexes and transactions included.
- **One contract suite proves it.** `src/tests/contract/repositories.contract.ts` states what
  every set of repositories promises. The unit tier runs it on the in-memory twin, the
  integration tier on Postgres. A promise added to a port is added there, so the scenarios can't
  pass on a twin that behaves differently from production.
- **The architecture tests check themselves.** Next to every rule there is a synthetic import
  that breaks it, and the test asserts that the rule reports it. A check that cannot fail proves
  nothing.
- **[version] The architecture tests read imports with `ts.preProcessFile`,** from the
  TypeScript 6 API that the `typescript` alias provides (see Packaging and build). TypeScript 7.0
  ships no programmatic API; one is expected in 7.1. "Types only" is checked by compiling the file
  with `ts.transpileModule`: anything but `export {};` in the output is runtime code.
- **Tests that span the workspace** run in `tooling/architecture` and cover what no single module
  can check: the module dependency graph (declared, through entry points, no cycles), one
  migration lock key and one bookkeeping table per module, no foreign key across schemas, the
  closed set of published views and the migration-order check. The last two are `todo`s.
  Turborepo's experimental `boundaries` covers part of the graph, and can be added on top.

---

## Where new code goes

| You are adding | Put it in |
| --- | --- |
| A rule (who may act, what is allowed) | `<area>/domain/`, with a unit test or a scenario |
| A use case | `<area>/services/`, then an operation on its controller |
| A query or a table | A method on the port in `ports.ts`, then the adapter, its in-memory twin and the promise in the contract suite; the table in `db/schema.ts` and a generated migration |
| Writes that must land together | A use case that receives `transaction` from the repositories and writes only through the repositories it is given |
| An outside system (email, payments, a queue) | A port in `ports.ts`, its adapter in `adapters/`, wired in `index.ts` |
| Something the host must provide | A port in `ports.ts`, an optional field in the config, a `<Port>MissingError` |
| A type consumers need | Its area, then re-exported from `contracts.ts` |
| An error consumers catch | Its area, exported as a class from `index.ts` and as a type from `contracts.ts` |
| A list another module needs to search or page | A column on a published view, or a new view with a recorded decision |
