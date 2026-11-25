# @module/sample

The `sample` domain module: one bounded context, in the shape the GYOS module standard describes.
It owns the Postgres schema `sample` and migrates it itself. Hosts build it once per process with
`createSampleModule(config)`, await `ready()`, then call its controllers.

## Before you build on it

This module was scaffolded from a template, and it still holds the template's example:

- **`src/items/` is an example area,** named when the module was scaffolded
  (`scripts/new-module.ts --area <plural> --entity <singular>`). It, `src/items-vocabulary.ts`
  (exported as `"./items"`), `features/items.feature` and the tests that use them show the shape
  of an area: a name unique within a tenant, and a rename. Make it this module's own, or replace
  it with an area named after the module's main concept; rename the `"./items"` export in
  `package.json` with the vocabulary file.
- **Its routes are an example too,** when the module was added to the host with
  `scripts/new-module.ts --host apps/api`: `apps/api/src/http/routes/sample.ts` and its test map
  the example's operations onto `/sample/items`.
- **`drizzle/` holds the example's migration,** `0000_init`, which creates the table
  `"sample"."items"`. Before the first deploy, delete `drizzle/` and run `pnpm db:generate` to
  start the history from this module's real schema. After the first deploy migrations are
  expand-only: a table that has shipped is never simply dropped, so an example table deployed
  once stays until a later contract step removes it.

## Scripts

| Script | Does |
| --- | --- |
| `pnpm typecheck` | Typechecks the source, the tests, the scenarios and the tooling |
| `pnpm test:unit` | Unit and architecture tests, no database |
| `pnpm test:scenarios` | The `.feature` files, on the in-memory repositories |
| `pnpm test:integration` | The adapters and migrations on Postgres: `TEST_DATABASE_URL`, a database with `test` or `verify` as a word of its name (`product_test`), whose `sample` schema is dropped |
| `pnpm build` | `src` to `dist`, with declarations |
| `pnpm db:generate` | Writes a migration for a change to `src/db/schema.ts` |
| `pnpm db:check` | Checks the migrations folder is consistent |
| `pnpm db:migrate` | Runs the migrations on `DATABASE_URL`, as `ready()` does |
