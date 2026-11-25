# Packaging and build

How a GYOS module is packaged and compiled, and why: `tsc`, an export condition of its own, and
a tsconfig written for TypeScript 6 and 7. Load this when scaffolding a module or a workspace, or
when a build, a resolution or a type-stripping problem comes up. The rules themselves are in
`standards/module.md`.

Sources were checked on 2026-11-25. Version-dependent details are marked **[version]**.

---

## Build with `tsc`

- **Turborepo recommends `tsc` for compiled internal packages.** It describes a compiled package
  as one that runs its own build with a tool like `tsc`, says most of them should use `tsc`, and
  adds that a bundler is "not necessary and adds extra complexity"
  ([Turborepo: internal packages](https://turborepo.dev/docs/core-concepts/internal-packages)).
- **Turborepo advises against TypeScript project references,** because they add another place to
  configure and another caching layer
  ([Turborepo: TypeScript guide](https://turborepo.dev/docs/guides/tools/typescript);
  [You might not need TypeScript project references](https://turborepo.dev/blog/you-might-not-need-typescript-project-references)).
  The same guide recommends a `tsconfig.json` per package rather than one at the root, which keeps
  typecheck tasks cacheable.
- **What `tsc` gives that a bundler doesn't:**
  - declarations (`.d.ts`) next to the JavaScript;
  - one output file per source file.
- **Why one file per source file matters for GYOS:**
  - `src/migrations.ts` and `dist/migrations.js` sit at the same depth, so `../drizzle` resolves
    to the same folder from both;
  - an error class has one definition in `dist/`, so `instanceof` agrees across entry points.
- **The alternatives** **[version, 2026-11]**:
  - **esbuild** emits neither declarations nor type errors.
  - **tsup** is unmaintained and points to tsdown
    ([tsup README](https://unpkg.com/tsup@9.0.0/README.md)).
  - **tsdown** is still 0.x.

**Where GYOS departs from its source.** The production module behind the standard builds with
esbuild through a `build.ts` script. GYOS keeps the reason for shipping a build at all: Node won't
strip types from files under `node_modules`, and a production install needs the module's own
dependencies. It changes the tool, for the reasons above.

---

## An export condition of GYOS's own

```json
"exports": {
  ".": {
    "@gyos/source": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
}
```

- **Why a custom condition.** A custom condition that points at source gives "live types"
  across a monorepo without a build step in development. It must come first, because conditions
  are matched in order
  ([Colin McDonnell: live types in a TypeScript monorepo](https://colinhacks.com/essays/live-types-typescript-monorepo)).
- **Why not `development`.** Many third-party packages publish `development` builds under that
  condition. Turning it on for the workspace would switch them too. A name unique to GYOS
  switches only GYOS modules.
- **Who turns it on, and how:**

| Tool | Setting |
| --- | --- |
| TypeScript | `customConditions: ["@gyos/source"]` |
| Node, tsx, Cucumber | `--conditions=@gyos/source`, for example through `NODE_OPTIONS` |
| Vite and Vitest | `resolve.conditions`, keeping the defaults (see below) |

**[version] Unverified for Vite and Vitest:** in Vite 6 and later, setting `resolve.conditions`
replaces the default list instead of extending it, and server-side resolution may read
`ssr.resolve.conditions`. The template has to set both, spreading Vite's exported defaults, and
check against the pinned Vitest.

---

## The tsconfig

**[version] TypeScript 6.0 changed three defaults, and 7 keeps them**
([TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html),
[Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)):

| Option | Old default | New default | Consequence |
| --- | --- | --- | --- |
| `types` | every package under `node_modules/@types` | `[]` | List `"node"` explicitly |
| `rootDir` | the common directory of the inputs | the directory of the `tsconfig.json` | Without `rootDir: "./src"` in the build config, output lands in `dist/src/` |
| `strict` | `false` | `true` | — |

**What the options are for:**
- **`module: "nodenext"`** makes TypeScript honour `exports`, so deep imports fail to resolve.
- **`verbatimModuleSyntax`** keeps `import type` explicit, which type stripping needs.
- **`erasableSyntaxOnly`** (TypeScript 5.8) rejects `enum`, parameter properties and namespaces:
  syntax that can't simply be erased
  ([TS 5.8 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)).
- **`rewriteRelativeImportExtensions`** (TypeScript 5.7) lets source import `./x.ts` and emits
  `./x.js`.

**Where `rootDir` goes.** It belongs in each module's `tsconfig.build.json` (`src` → `dist`, tests
excluded). It does not belong in a shared base, where `./src` would resolve next to the base
file. It does not belong in the typecheck config either, which also covers `features/`.

**[version] TypeScript 7.0** is the native port, released 2026-07-08. It ships no programmatic
API; one is expected in 7.1. Anything that calls the compiler API needs TypeScript 6 installed
next to it, under the npm alias the announcement documents
([Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)):
- GYOS's architecture tests, which use `ts.createSourceFile`, `ts.preProcessFile` and
  `ts.transpileModule`;
- typescript-eslint, whose parser needs the API even for untyped rules.

How lint gets TypeScript 6 is **not settled yet**; see the module standard.

---

## Node's type stripping

- **[version] Availability:** on by default since Node 22.18 / 23.6, and stable since
  24.12 / 25.2 ([Node: TypeScript](https://nodejs.org/api/typescript.html)).
- **What it doesn't do:**
  - it ignores `tsconfig.json`, `paths` included;
  - it refuses TypeScript files under `node_modules`;
  - it only erases syntax, hence `erasableSyntaxOnly`.
- **What GYOS uses it for:** scripts such as `scripts/new-module.ts` and `scripts/check-links.ts`,
  run with `node` directly.
- **The no-build dev loop** (`node --conditions=@gyos/source apps/api/src/main.ts`) depends on
  stripping working through pnpm's workspace symlinks. They resolve to real paths, outside
  `node_modules`, so it works: verified on Node 24.6 (2026-11-25), where
  `scripts/verify-templates.ts` runs the host template this way with two modules.

---

## Turborepo tasks

```json
{
  "globalDependencies": ["tsconfig.base.json"],
  "tasks": {
    "transit": { "dependsOn": ["^transit"] },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["transit"] },
    "test:unit": { "dependsOn": ["transit"] },
    "test:scenarios": { "dependsOn": ["transit"], "outputs": ["reports/**"] },
    "test:integration": { "cache": false }
  }
}
```

`build` depends on the builds of the packages it imports, and caches `dist/**`. Integration
tests talk to a database, so they are never cached.

**A task with no `dependsOn` replays stale results.** Turborepo hashes a task from its own
package's files and the hashes of the tasks it depends on. With `@gyos/source`, a package's
typecheck and tests compile its dependencies' source, which is in neither. Turborepo's docs
describe exactly this: a breaking change in a dependency, then a cache hit in the package that
uses it. `dependsOn: ["^typecheck"]` fixes it but serialises the tasks; a **transit node**, a task
that depends on `^transit` and matches no script, fixes it and keeps them parallel
([Turborepo: dependent tasks that can be run in parallel](https://turborepo.dev/docs/crafting-your-repository/configuring-tasks#dependent-tasks-that-can-be-run-in-parallel)).
**Verified** on 2026-11-25 with Turborepo 2.11.13: without it, breaking a module's factory
signature left the host's `typecheck` a cache hit; with it, the task ran and failed.

**A package that reads other packages from disk** without depending on them, like
`tooling/architecture`, needs them in its `inputs`. A glob that starts with `$TURBO_ROOT$` is
relative to the repository root, and setting `inputs` drops the `.gitignore` defaults, so the
build and dependency folders are excluded by hand
([Turborepo: `inputs`](https://turborepo.dev/docs/reference/configuration#inputs),
[`$TURBO_ROOT$`](https://turborepo.dev/docs/reference/configuration#turbo_root)).
**Verified** with Turborepo 2.11.13: the inputs list the modules' and apps' files and none under
`node_modules` or `dist`, and a broken module made the cached architecture tests run and fail.

**Root files** reach a package's hash only through `globalDependencies`
([Turborepo: `globalDependencies`](https://turborepo.dev/docs/reference/configuration#globaldependencies)),
so `tsconfig.base.json` is listed there.

**`sideEffects: false`** is a hint for bundlers' tree-shaking and has no effect in plain Node. It
is true for a GYOS module because nothing is constructed at import time (module standard, M3).
