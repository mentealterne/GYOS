# Standard: domain module

The shape of every domain module GYOS generates, and the rules it keeps. GYOS's templates, the
`/gyos:context` skill and `/gyos:doctor` all follow this file. Change the standard here first,
then the templates. The reasons and sources behind it are in `knowledge/ports-and-adapters.md`,
`knowledge/data-and-migrations.md` and `knowledge/modular-monolith.md`.

The shape is taken from a production module that went through a long series of changes and
schema migrations: an identity module consumed in-process by several apps. Its rules are
**decisions, not observations**. Each one is here because something broke, or would have broken,
without it. Where GYOS departs from that module (Drizzle instead of Kysely, `tsc` instead of
esbuild, a dedicated export condition), the reason is given in place.

Versions were checked on 2026-11-25. Details that depend on a version are marked **[version]**.

---

## What a module is

A module is the code of **one bounded context**:

- It lives in `modules/<name>/` and is the workspace package `@module/<name>`.
- It is an **ESM package that ships a build**, compiled with `tsc`.
- It **owns one Postgres schema**, named after it, and migrates that schema itself.
- Apps consume it **in-process**, through its public entry points. There is no HTTP between
  modules: the product is a modular monolith.
- Inside, it is **ports and adapters**. Pure rules sit in the middle, use cases around them, and
  every piece of I/O behind an interface that the host fills in.

---

## The tree

```
modules/<name>/
├── package.json            exports: ".", "./contracts", the vocabulary subpaths
├── tsconfig.json           typecheck: src, tests, features
├── tsconfig.build.json     build: src → dist, with declarations
├── drizzle.config.ts       drizzle-kit, this module's schema only
├── drizzle/                generated SQL migrations; shipped with the package
├── vitest.config.ts
├── cucumber.mjs            loads tsx-register.js, then features/support and features/steps
├── tsx-register.js
├── features/               scenarios: *.feature, steps/, support/ (world, hooks, in-memory adapters)
└── src/
    ├── index.ts            create<Name>Module(config): the module's factory
    ├── contracts.ts        types, ports a host implements, errors as types. No runtime code
    ├── repositories.ts     builds every adapter on its connection
    ├── migrations.ts       the migrations folder, resolved the same from src/ and dist/
    ├── module-controllers/ the operations hosts call: parse input, delegate
    ├── <area>/
    │   ├── domain/         pure rules
    │   ├── services/       use cases: load through ports, apply rules, write through ports
    │   ├── ports.ts        what the area needs from outside
    │   └── adapters/       how that is provided: the only code that does I/O
    ├── <vocabulary>.ts     published language: constants, unions, zod schemas. No I/O
    ├── db/                 the schema (pgSchema + tables), the migration runner
    ├── config/             the configuration contract and its validation
    ├── logger.ts           the logger port and the fallback
    └── tests/
        ├── unit/           no database: domain, services, controllers, architecture
        └── integration/    adapters against a real Postgres
```

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
| `index.ts` | The factory and the config contract | Everything it wires | — |
| `contracts.ts` | Types, ports and errors (as types) that consumers code against | Types only | Any implementation |
| `module-controllers/` | The operations, with input parsing | Services, vocabulary, zod | Adapters, `db/`, transport types |
| `<area>/domain/` | Pure rules: no I/O, no clock, no logger | The vocabulary, its own `domain/` | Anything else |
| `<area>/services/` | Use cases | Its `domain/`, any `ports.ts` (types), the logger port | `adapters/`, `db/`, Drizzle, `pg` |
| `<area>/ports.ts` | Interfaces: repositories, notifiers, outside systems | Types only | Any implementation |
| `<area>/adapters/` | Implementations of the ports, and mapping rows to domain types | Its `ports.ts`, `db/`, Drizzle | `services/`, another area's adapters |
| `<vocabulary>.ts` | The module's published language | zod | Anything with I/O |

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
- it returns the controllers.

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

Nothing in the module reads `process.env`: the host reads the environment and passes the values
in.
_Why:_ bad configuration fails at boot, not at somebody's first request, and the person fixing
it sees every problem in one restart, not one per restart.

**M7. The module owns its schema, and nothing outside it.**
- Its tables live in its own Postgres schema (`pgSchema("<name>")`).
- No foreign key leaves the schema: an id that belongs to another module is a plain column.
- An adapter never joins another module's tables.
- The only sanctioned cross-schema read is another module's **published views** (below).

_Trap:_ a casual cross-schema join today is a blocker the day the boundary moves.

**M8. The module migrates its own schema, expand-only.**
`ready()` runs the module's migrations once per pool. Runs in flight are shared, and a failed run
is forgotten so that the next call retries it. Every host awaits `ready()` for every module
before it serves a request or runs a job.

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
  `rewriteRelativeImportExtensions`.
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
}

export interface ResolvedBillingConfig {
  db: Pool;
  logger: BillingLogger;
  clock: () => Date;
  invoiceNotifier: InvoiceNotifier | null;
  migrationsFolder: string;
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
- **The host maps them** to HTTP statuses, job outcomes or CLI exit codes. The module never
  produces an HTTP error.
- **Anything else is a bug** and is thrown as a plain error.

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

- **The factory calls `config.logger.child({ module: "billing" })` once**, so every line the module
  writes carries its name.
- **Without an injected logger, only warnings and errors reach stderr.** A library documents its
  logging and doesn't configure output for the application.
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

**The schema.** `src/db/schema.ts` declares `export const billing = pgSchema("billing")` and
every table on it. The schema name is a constant used everywhere; nothing hard-codes it.

**drizzle-kit, one module at a time.** Each module has its own `drizzle.config.ts`:

```ts
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["billing"],
  // Bookkeeping in the shared `drizzle` schema, one table per module (see below).
  migrations: { schema: "drizzle", table: "__migrations_billing" },
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- **`drizzle.config.ts` may read `process.env`.** It is tooling that runs on a developer's machine
  or in CI. M6 applies to `src/`.
- **`schemaFilter` only affects `push` and `pull`,** not `generate`.
- **Each module's bookkeeping is its own table in a shared `drizzle` schema, not a table in the
  module's schema.** The migrator runs `CREATE SCHEMA IF NOT EXISTS` on the bookkeeping schema
  before anything else, and the first generated migration runs a bare `CREATE SCHEMA "billing"`.
  If the two were the same schema, the first migration would fail. That failure is inferred from
  Drizzle's source, not run.

**Running migrations.** Drizzle's migrator applies every pending migration in one transaction, but
**it takes no lock** **[version: 0.45, and 1.0 rc]**. Two processes booting at once would race.
`ready()` therefore holds a session-level advisory lock on a dedicated connection:

```ts
// src/db/migrate.ts
const MIGRATION_LOCK_KEY = 4_217_001n; // a constant per module, unique in the workspace

export async function migrateBilling(pool: Pool, migrationsFolder: string): Promise<void> {
  const client = await pool.connect(); // one session for the lock and the migration
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await client.query("set lock_timeout = '5s'"); // after the advisory lock, so it can't time out
    await migrate(drizzle({ client }), {
      migrationsFolder,
      migrationsSchema: "drizzle",
      migrationsTable: "__migrations_billing",
    });
  } finally {
    client.release(true); // destroy the connection: frees the session lock and the setting
  }
}
```

A `db:migrate` script runs the same function by hand.

**[version] The out-of-order trap in Drizzle 0.x.** A migration is applied only if its timestamp
is later than the last one applied, and hashes are not re-checked. A migration written on an old
branch and merged later is therefore **skipped without a word**. Until version 1, which applies
every missing migration by name, a CI check fails any pull request that adds a migration older
than the newest one on `main`.

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
    "lint": "eslint .",
    "test:unit": "vitest run",
    "test:scenarios": "cucumber-js",
    "test:integration": "vitest run -c vitest.config.integration.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node src/db/migrate-cli.ts",
    "db:check": "drizzle-kit check"
  }
}
```

**`@gyos/source`, not `development`.** The condition comes first, and its name is unique to GYOS.
A generic `development` condition also matches third-party packages that ship development builds,
so turning it on would switch them too. Each tool turns `@gyos/source` on in its own way:

| Tool | How |
| --- | --- |
| TypeScript | `customConditions: ["@gyos/source"]` |
| Node | `--conditions=@gyos/source` |
| Vite and Vitest | `resolve.conditions` |

**The build is `tsc`** **[version]**:
- It emits JavaScript and declarations, file for file.
- Turborepo recommends it for internal packages and advises against project references.
- In `turbo.json`, `build` depends on `^build` and outputs `dist/**`.
- esbuild emits no declarations and no type check. tsup is unmaintained.

**The base tsconfig** **[version: TypeScript 7.0]**:

| Option | Value |
| --- | --- |
| `module` | `"nodenext"` |
| `verbatimModuleSyntax` | `true` |
| `erasableSyntaxOnly` | `true` |
| `rewriteRelativeImportExtensions` | `true` |
| `customConditions` | `["@gyos/source"]` |
| `declaration`, `declarationMap` | `true` |
| `types` | `["node"]` |
| `rootDir` | `"./src"` |

TypeScript 7 changed three defaults that this table makes explicit:
- `types` is now `[]`;
- the default `rootDir` changed;
- `strict` is now on by default.

**Erasable syntax only.** No `enum`, no parameter properties, no `namespace`. Use `as const`
objects with union types, and factory functions rather than classes. This keeps every file
runnable by Node's type stripping, and stable since Node 24.12. The dev loop runs
`node --conditions=@gyos/source apps/api/src/main.ts` with no build step.

**[version] Node 24 LTS** is the baseline. Cucumber 13 needs Node 22, 24 or ≥ 26, and the
OpenTelemetry JS SDK 3 needs ≥ 22.15.

---

## Testing

| Tier | Where | Runs against | Proves |
| --- | --- | --- | --- |
| **Unit** | `src/tests/unit/` | In-memory ports, no database | Domain rules, use cases, controller parsing |
| **Architecture** | `src/tests/unit/architecture/` | The source's imports | The layer rules above; contracts hold types only; the migrations folder resolves |
| **Scenarios** | `features/` | The controllers, with the in-memory adapters from `features/support/` | The product promises, in the language of the people who use it |
| **Integration** | `src/tests/integration/` | Adapters on a real Postgres (docker compose) | Queries, mapping, migrations, the published views |

- **One set of in-memory adapters** in `features/support/` serves both the scenarios and the unit
  tests, so a phrase like "Giulia is an HR director" means the same thing everywhere.
- **The architecture tests check themselves.** Next to every rule there is a synthetic import
  that breaks it, and the test asserts that the rule reports it. A check that cannot fail proves
  nothing.
- **[version] The architecture tests read imports with `ts.preProcessFile`.** TypeScript 7.0 ships
  no programmatic API; one is expected in 7.1. Until then, the tests use the TypeScript 6 API,
  installed next to 7 under the npm alias `@typescript/typescript6`, as the TypeScript 7
  announcement documents.
- **Tests that span the workspace** run in `tooling/architecture` and cover what no single module
  can check: the module dependency graph (declared, through entry points, no cycles), the closed
  set of published views, no foreign key across schemas, and the migration-order check.
  Turborepo's experimental `boundaries` covers part of the graph, and can be added on top.

---

## Where new code goes

| You are adding | Put it in |
| --- | --- |
| A rule (who may act, what is allowed) | `<area>/domain/`, with a unit test or a scenario |
| A use case | `<area>/services/`, then an operation on its controller |
| A query or a table | A method on the port in `ports.ts`, then the adapter; the table in `db/schema.ts` and a generated migration |
| An outside system (email, payments, a queue) | A port in `ports.ts`, its adapter in `adapters/`, wired in `index.ts` |
| Something the host must provide | A port in `ports.ts`, an optional field in the config, a `<Port>MissingError` |
| A type consumers need | Its area, then re-exported from `contracts.ts` |
| An error consumers catch | Its area, exported as a class from `index.ts` and as a type from `contracts.ts` |
| A list another module needs to search or page | A column on a published view, or a new view with a recorded decision |
