# Standard: domain module

The shape of every domain module GYOS generates, and the rules it keeps. GYOS's templates, the
`/gyos:context` skill and `/gyos:doctor` all follow this file. Change the standard here first,
then the templates.

The shape is taken from a production module that went through a long series of changes and
schema migrations: an identity module consumed in-process by several apps. Its rules are
**decisions, not observations**. Each one is here because something broke, or would have broken,
without it.

---

## What a module is

A module is the code of **one bounded context**:

- It lives in `modules/<name>/` and is the workspace package `@module/<name>`.
- It is an **ESM package that ships a build**.
- It **owns one Postgres schema**, named after it, and migrates that schema itself.
- Apps consume it **in-process**, through its public entry points. There is no HTTP between
  modules: the product is a modular monolith.
- Inside, it is **ports and adapters**. Pure rules sit in the middle, use cases around them, and
  every piece of I/O behind an interface that the composition root fills in.

---

## The tree

```
modules/<name>/
├── package.json            exports: ".", "./contracts", the vocabulary subpaths
├── build.ts                esbuild: ESM, npm dependencies external
├── tsconfig.json
├── drizzle.config.ts       this module's schema only
├── drizzle/                generated SQL migrations; shipped with the package
├── vitest.config.ts
├── cucumber.mjs            loads tsx-register.js, then features/support and features/steps
├── tsx-register.js
├── features/               scenarios: *.feature, steps/, support/ (world, hooks, in-memory adapters)
└── src/
    ├── index.ts            create<Name>Module(config): the composition root
    ├── contracts.ts        types, ports a host implements, errors as types. No runtime code
    ├── repositories.ts     builds every adapter on its connection
    ├── migrations.ts       where the migrations folder is, from src/ and from dist/ alike
    ├── module-controllers/ the operations hosts call: validate input, delegate
    ├── <area>/
    │   ├── domain/         pure rules
    │   ├── services/       use cases: load through ports, apply rules, write through ports
    │   ├── ports.ts        what the area needs from outside
    │   └── adapters/       how that is provided: the only code that does I/O
    ├── <vocabulary>.ts     published language: enums, constants, zod schemas. No I/O
    ├── db/                 the schema (pgSchema + tables), connection, migration runner
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
host (apps/api route, a worker job, a script)
  ↓  imports @module/<name>  (or /contracts for types only)
index.ts — create<Name>Module(config)            the composition root
  ↓
module-controllers/*.controller.ts               validate input, call one use case
  ↓
<area>/services/                                 use cases; receive ports, build no queries
  ↓                      ↘
<area>/domain/           <area>/ports.ts          interfaces
pure rules                 ↑ implemented by
                         <area>/adapters/         Drizzle, queues, outside APIs
```

**Layers are not skipped.** A controller doesn't query. A service doesn't import an adapter or a
database handle. A host doesn't import anything below the published entry points.

| Part | Holds | May import | Never imports |
| --- | --- | --- | --- |
| `index.ts` | The factory and the config contract | Everything it wires | — |
| `contracts.ts` | Types, ports and errors (as types) that consumers code against | Types only | Any implementation |
| `module-controllers/` | The operations, with input validation | Services, vocabulary, zod | Adapters, `db/`, transport types |
| `<area>/domain/` | Pure rules: no I/O, no clock, no logger | The vocabulary, its own `domain/` | Anything else |
| `<area>/services/` | Use cases | Its `domain/`, any `ports.ts` (types), the logger port | `adapters/`, `db/`, Drizzle, `pg` |
| `<area>/ports.ts` | Interfaces: repositories, notifiers, outside systems | Types only | Any implementation |
| `<area>/adapters/` | Implementations of the ports, and mapping rows to domain types | Its `ports.ts`, `db/`, Drizzle | `services/`, another area's adapters |
| `<vocabulary>.ts` | The module's published language | zod | Anything with I/O |

**Areas talk through ports and rules, never through each other's adapters.**

Only adapters touch the database, along with `db/` itself and the composition in
`repositories.ts` and `index.ts`.

---

## Invariants

**M1. One factory, one composition root.**
`create<Name>Module(config)` builds everything: it resolves the config, opens nothing of its own,
builds the adapters on the injected connection, and returns the controllers. A host calls it
**once per process** and keeps the result.
_Trap:_ building the module per request means building a new set of repositories on every call.

**M2. The module owns no transport.**
No Express, no `Request`/`Response`, no framework types in the root entry. The host maps HTTP,
jobs or CLI arguments onto controller calls.
_Trap:_ one framework type in a signature makes the module importable by exactly one kind of
consumer.

**M3. Nothing is constructed at import time.**
Construction happens inside the factory body. That includes loggers, which are built lazily on
first use.
_Trap:_ a module-scope database handle runs on import in every consumer, tests and builds
included.

**M4. Every dependency is injected.**
The connection pool, the logger, the clock, queues, notifiers and outside clients come in through
the config. None of them is a module-scope import.
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
still serving. That rules out `DROP`, `RENAME` and `NOT NULL` without a default in the same
deploy as the code that needs them. Contraction is a later, separate deploy.

**M9. The contract carries no implementation.**
`contracts.ts` re-exports types only, and the module's error classes appear there as types. To
catch an error with `instanceof`, a consumer imports the class from the root entry.
_Why:_ every build entry carries its own copy of a class, so an error thrown by `dist/index.js`
is not an instance of the copy in `dist/contracts.js`.

**M10. Modules depend on each other one way.**
- **By default**, a module that needs something from another **declares a port in its own
  language**, and the host implements that port by calling the other module. The dependency then
  lives in the composition root, which is also where junctions belong (see below).
- **When a module deliberately conforms to another's language**, it may import that module
  directly. It does so through declared entry points only, lists the dependency in its own
  `package.json`, and receives the instance through its config.
- **Always:** no cycles. The architecture tests check every one of these rules.

The compiler is the first line of enforcement:
- TypeScript resolves with `moduleResolution: "bundler"` or `"nodenext"`, so `exports` are
  honoured and a deep import fails.
- tsconfig `paths` may point only into the module's own `src/`, never into another package,
  because `paths` bypass `exports`.
- pnpm doesn't hoist undeclared dependencies, so importing a module that isn't in `package.json`
  fails.

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
  /** Where log lines go. Defaults to the console fallback in src/logger.ts. */
  logger?: BillingLogger;
  /** Now. Injected so that rules about time can be tested. Defaults to () => new Date(). */
  clock?: () => Date;
  /** A port the host implements: how the product tells a customer an invoice is due. */
  invoiceNotifier?: InvoiceNotifier;
}

export interface ResolvedBillingConfig {
  db: Pool;
  logger: BillingLogger;
  clock: () => Date;
  invoiceNotifier: InvoiceNotifier | null;
}
```

**An optional port that the use case needs** is checked when the use case runs, before anything
is written. The module throws `<Port>MissingError`, so a request is never recorded without
anybody being told.

---

## The logger

Each module declares the subset of a logger it uses, and nothing more:

```ts
// src/logger.ts
export interface BillingLogger {
  error(message: string | Error, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}
```

- **The fallback** is a console logger that prefixes every line with `[MODULE/BILLING]`. It is
  built lazily (M3).
- **The real logger is chosen at setup:** pino, OpenTelemetry logs, or the team's own. The host
  builds it once and injects it into every module, usually as a child logger tagged with the
  module's name.
- **The module never depends on a logging library.** The adapter from pino or OpenTelemetry to
  the port lives in the host.
- **One line at bootstrap** says the module is ready and which logger it is using. A module that
  works correctly is otherwise silent, so this line is the cheapest way to answer "is it loaded?"
  from the logs alone.

---

## Data: schema, migrations, published views

**The schema.** `src/db/schema.ts` declares `export const billing = pgSchema("billing")` and
every table on it. The schema name is a constant used everywhere; nothing hard-codes it.

**drizzle-kit, one module at a time.** Each module has its own `drizzle.config.ts`:

```ts
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["billing"],
  // The module's own bookkeeping, inside its own schema.
  migrations: { schema: "billing", table: "__drizzle_migrations" },
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

`drizzle.config.ts` is tooling that runs on a developer's machine or in CI, so it may read
`process.env`. M6 applies to `src/`.

**Running migrations.** `ready()` runs Drizzle's migrator on a client that holds a Postgres
advisory lock keyed on the schema name, so that several processes booting at once apply each
migration exactly once. A `db:migrate` script runs the same code by hand.

**Shipping them.** The migrator reads `drizzle/` at runtime, so the folder is listed in
`package.json` `files`. `src/migrations.ts` sits directly under `src/` and resolves the folder as
`new URL("../drizzle/", import.meta.url)`. That path is the same from `src/migrations.ts` and from
the bundled `dist/index.js`, and a unit test checks that it resolves.

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

**The module ships a build, not raw TypeScript.** A Node consumer would need type-stripping to
load `.ts` from `node_modules`, and a production install must bring the module's own
dependencies with it. `exports` therefore point at `dist/`, and a `development` condition points
at `src/` for the dev loop.

```json
{
  "name": "@module/billing",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "development": "./src/index.ts",
      "default": "./dist/index.js"
    },
    "./contracts": {
      "types": "./src/contracts.ts",
      "development": "./src/contracts.ts",
      "default": "./dist/contracts.js"
    }
  },
  "files": ["dist", "src", "drizzle"],
  "scripts": {
    "build": "tsx build.ts",
    "dev": "tsx build.ts --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test:unit": "vitest run",
    "test:scenarios": "cucumber-js",
    "test:integration": "vitest run -c vitest.config.integration.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate-cli.ts",
    "db:check": "drizzle-kit check"
  }
}
```

**`build.ts`** runs esbuild with two kinds of entry:

- **`src/index.ts`**: bundled for `platform: "node"`, `format: "esm"`, with every npm dependency
  kept external (`esbuild-node-externals`). The bundle is the module's own code only; its
  dependencies resolve at runtime from the module's own `package.json`.
- **The contract and the vocabulary subpaths**: built for `platform: "neutral"`, so a browser
  bundle can import them. A library that must be a single copy in the process (zod, so that
  `instanceof ZodError` agrees) stays external.

`--watch` rebuilds on change, for anything that does not honour the `development` condition. Hosts
that do honour it are Vite (`resolve.conditions`), Node and tsx (`--conditions=development`), and
TypeScript (`customConditions`).

---

## Testing

| Tier | Where | Runs against | Proves |
| --- | --- | --- | --- |
| **Unit** | `src/tests/unit/` | In-memory ports, no database | Domain rules, use cases, controller validation |
| **Architecture** | `src/tests/unit/architecture/` | The source, parsed with the TypeScript compiler API | The layer rules above; contracts hold types only; the migrations folder resolves |
| **Scenarios** | `features/` | The controllers, with the in-memory adapters from `features/support/` | The product promises, in the language of the people who use it |
| **Integration** | `src/tests/integration/` | Adapters on a real Postgres (docker compose) | Queries, mapping, migrations, the published views |

- **One set of in-memory adapters** in `features/support/` serves both the scenarios and the unit
  tests, so a phrase like "Giulia is an HR director" means the same thing everywhere.
- **The architecture tests check themselves.** Next to every rule there is a synthetic import
  that breaks it, and the test asserts that the rule reports it. A check that cannot fail proves
  nothing.
- **Tests that span the workspace** run in `tooling/architecture` and cover what no single module
  can check: the module dependency graph (declared, through entry points, no cycles), the closed
  set of published views, and no foreign key across schemas.

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
