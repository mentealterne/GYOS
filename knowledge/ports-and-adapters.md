# Ports and adapters, dependency injection, configuration, logging

Why a GYOS module is shaped the way `standards/module.md` says. Load this when scaffolding or
reviewing a module, when someone asks "why not a DI container?", or when choosing a logger at
setup.

Sources were checked on 2026-11-25. Version-dependent details are marked **[version]**.

---

## Ports and adapters

**The intent (Cockburn, 2005).** Let an application be driven equally well by users, programs,
tests or batch scripts, and let it be developed and tested in isolation from its run-time devices
and databases. A **port** is a "purposeful conversation". An **adapter** converts between the
port's API and one particular technology.
([Hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/))

**Driving and driven.**
- **Driving (primary) ports** are the application's API.
- **Driven (secondary) ports** are what the application needs from the outside.
- **Naming:** name ports by purpose ("for obtaining orders"), not by technology.
- **Wiring:** a composition root chooses the adapters at startup.

([Garrido de Paz](https://jmgarridopaz.github.io/content/hexagonalarchitecture.html)) Cockburn's
2025 talk restates the "for doing something" naming, and says the application owns both kinds of
port interface
([Cockburn, 2025](https://alistaircockburn.com/Talk%202025-11%20Hexagonal.pdf)).

**In a GYOS module:**

| Hexagonal | GYOS |
| --- | --- |
| Driving port | The controllers in `module-controllers/` |
| Driven ports | `<area>/ports.ts` |
| Adapters | `<area>/adapters/`, named for purpose plus technology: `session-store.postgres.ts` |
| Application | `<area>/services/` and `<area>/domain/` |

**Clean Architecture says the same with different words** (Robert C. Martin):
- Entities ≈ `domain/`.
- Use cases ≈ `services/`.
- Interface adapters ≈ controllers and `adapters/`.
- Frameworks and drivers ≈ Express and `pg`.
- The dependency rule points inward.

([The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html))

### Where things belong

A credible TypeScript reference is
[Sairyss/domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon).

- **Input validation happens at the driving side.** The controller parses raw input into typed
  commands: "parse, don't validate"
  ([Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)). The domain
  only *guards* its invariants. Validation libraries stay out of `domain/`.
- **Errors.**
  - The core never produces an HTTP error.
  - Expected business failures are typed: error classes with a `code` union, or a `Result`.
  - Bugs throw.
  - The host maps business failures to HTTP statuses.

  The production module behind GYOS's standard throws typed error classes, so GYOS does too, with
  `Result` as an accepted alternative recorded in an ADR.
- **Mapping.** Persistence rows (Drizzle) are not domain models. The mapping lives in the driven
  adapter.

---

## Dependency injection without a container

**Pure DI** means applying the principles of dependency injection without a container.
- **The composition root** sits as close as possible to the application's entry point.
- **"Only applications should have Composition Roots. Libraries and frameworks shouldn't."** A
  library uses constructor injection, plus a facade with good defaults.

([Pure DI](https://blog.ploeh.dk/2014/06/10/pure-di/),
[Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/),
[DI-friendly library](https://blog.ploeh.dk/2014/05/19/di-friendly-library/))

**In GYOS:**
- `create<Name>Module(config)` is the module's facade.
- The host's `main.ts` is the composition root. It builds the pool and the logger, builds every
  module once, and wires the junctions.

**Pure DI is checked by the compiler.** Seemann argues that type-safe containers are therefore
redundant ([Type-safe DI containers are redundant](https://blog.ploeh.dk/2022/03/14/type-safe-di-containers-are-redundant/)).

**Why GYOS doesn't use a container** **[version, 2026-11]**:

| Container | Problem for GYOS |
| --- | --- |
| tsyringe 4.10 | Needs `experimentalDecorators`, `emitDecoratorMetadata` and `reflect-metadata`. esbuild, and therefore tsx and Vite, doesn't support `emitDecoratorMetadata` ([esbuild](https://esbuild.github.io/content-types/)). No release since April 2025 |
| inversify 8.3 | Decorator-based, with the same metadata needs |
| awilix 14.0 | Decorator-free, but its CLASSIC mode parses parameter names and breaks under minification; PROXY, the default, avoids that |

On top of that, `erasableSyntaxOnly` (TypeScript 5.8) bans parameter properties and enums, which
makes class-heavy code verbose
([TS 5.8 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)).

**GYOS's choice: factory functions and closures, no container.** Per-request things, such as a
transaction or a request-scoped logger, are passed as arguments, not through container scopes.

---

## Configuration

- **No `process.env` inside a module.** Configuration comes from the host, which reads the
  environment, in the spirit of the twelve-factor app
  ([12factor: config](https://12factor.net/config)).
- **Validate at startup, all at once.** This comes from the production module behind the
  standard: an input type with optional fields, a resolved type without, and one `resolve…`
  function that lists every problem. A host fixing one value per restart is the failure it
  prevents.

---

## The logger

**A library documents its logging and doesn't configure output.** Python's logging guide states
the principle plainly. With no configuration, sending warnings and above to stderr is "the best
default behaviour"
([Python: logging for a library](https://docs.python.org/3/howto/logging.html#configuring-logging-for-a-library)).
GYOS modules follow it: without an injected logger, only warnings and errors reach stderr.

**The port** is minimal: `debug`, `info`, `warn` and `error`, each taking `(message, fields?)`,
plus `child(bindings)`. The factory calls `logger.child({ module: "<name>" })` once, so every line
carries the module's name.

**pino** **[version: 10.4]** is the default suggestion.
- Its native call order is `logger.info([mergingObject], [message])`, so the adapter from pino
  to the port is a few lines.
- `child(bindings, { msgPrefix })` pins fields and a prefix onto every line, and children inherit
  the level.

([pino API](https://unpkg.com/pino@10.4.0/docs/api.md))

**OpenTelemetry** **[version]**:
- The JS SDK 3.0 stabilized logs, folded `api-logs` into `@opentelemetry/api`, and needs
  Node ≥ 22.15 ([OTel JS SDK 3.0](https://opentelemetry.io/blog/2026/otel-js-sdk-3-0/)).
- `@opentelemetry/instrumentation-pino` 0.71 adds trace correlation and sends pino's lines to the
  OTel logs SDK, for pino `>=5.14 <11`
  ([npm](https://www.npmjs.com/package/@opentelemetry/instrumentation-pino)).

So the modules depend only on the port, and the host decides between pino alone and pino with
OpenTelemetry.

### What `/gyos:init` asks when choosing a logger

1. Where do logs go: JSON on stdout for a platform to collect, or straight to a vendor?
2. Do you need trace correlation, or export to OpenTelemetry?
3. Do you want readable output in development (`pino-pretty`)?
4. Do you need different log levels per module?
5. Which fields must be redacted, such as personal data or secrets (pino's `redact`)?
6. Is a framework already providing a logger you want to keep?

The answers become an ADR, and the host's logger factory is generated from them.

---

## Enforcing the layers

The layer rules are only real if something fails when they are broken.

| Option | Version (2026-11) | Notes |
| --- | --- | --- |
| **Hand-written Vitest test** | — | Reads imports with the compiler API: `ts.preProcessFile(src, true, true).importedFiles` for the specifiers, or the syntax tree (`ts.createSourceFile`) where a rule depends on whether an import is type-only, which `importedFiles` doesn't report. No extra dependency, and each rule is a few lines that read like the standard. **GYOS's choice** |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/faq.md) | 18.9 | Path and regex rules, CI output, graphs. With only TypeScript 7.0 installed it behaves "as if there's no TypeScript compiler"; it works again from 7.1, or with TypeScript ≤ 6 next to it |
| [eslint-plugin-boundaries](https://www.jsboundaries.dev/) | 7.4.5 | Editor feedback through `boundaries/elements` and `boundaries/dependencies`. Depends on typescript-eslint, which needs the TypeScript 6 API |
| [Turborepo boundaries](https://turborepo.dev/docs/reference/boundaries) | experimental | Flags imports outside a package and undeclared dependencies, with tag-based rules. Good for rules between modules |

**[version] TypeScript 7.0** is the native Go port, released 2026-07-08. It ships **no
programmatic API**; a new one is expected in 7.1
([Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)).
The announcement publishes `@typescript/typescript6`, which re-exports the 6.0 API and ships a
`tsc6` binary, and recommends two npm aliases: `"typescript": "npm:@typescript/typescript6"` for
tools that import `typescript`, and `"@typescript/native": "npm:typescript@^7"` so that `tsc` is
TypeScript 7. GYOS's workspace template does exactly that, and its architecture tests
`import ts from "typescript"` to get `ts.createSourceFile`, `ts.preProcessFile` and `ts.transpileModule`. Verified with
`tsc` 7.0.2 and API 6.0.3 on 2026-11-25.

**Recommended combination:**
- the hand-written test for layer rules inside a module;
- the same test, or Turborepo boundaries, for rules between modules;
- eslint-plugin-boundaries only if a team wants feedback in the editor.

---

## Verified

Run on 2026-11-25 by `scripts/verify-templates.ts` (Node 24.6 locally, 24.22 in CI):

- **Node's type stripping works through pnpm's workspace symlinks.** A host run with
  `node --conditions=@gyos/source src/main.ts` imported two modules: Node followed
  `node_modules/@module/<name>` to the real path `modules/<name>/src/index.ts`, outside
  `node_modules`, and stripped its types.

## Not verified

- How eslint-plugin-boundaries resolves TypeScript imports: its documentation page didn't render.
- Whether typescript-eslint works with the `typescript` → `@typescript/typescript6` alias.
- A `pnpm deploy` copy puts the modules under `node_modules`, where Node refuses to strip types;
  that is why production runs `dist`. Not tried.
