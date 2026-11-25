# Frontends

How `/gyos:init` creates `apps/web/`. GYOS doesn't ship a frontend template: each framework's
official scaffolder stays current where a copied template would rot. GYOS adds a thin layer on
top.

## Which scaffolder

| Framework | SSR or SEO needed? | Scaffolder |
| --- | --- | --- |
| React | No | Vite: `pnpm create vite apps/web --template react-ts` |
| React | Yes | Next.js: `pnpm create next-app apps/web` |
| Svelte | Either | SvelteKit: `pnpm dlx sv create apps/web` |
| Vue | No | Vite: `pnpm create vue apps/web` |
| Vue | Yes | Nuxt: `pnpm create nuxt apps/web` |

**Scaffolders change their flags between versions.** Before running one, run it with `--help`.
Then pass the flags that make it:
- non-interactive;
- TypeScript;
- free of example content;
- pnpm-based;
- with no git init, since the product already is a repo;
- with no install of its own, because the workspace installs once, at the end.

Never pass `--overwrite` or `--force`. If a prompt can't be answered by a flag, ask the user,
then run the command.

## Fold it into the workspace

The scaffolder writes a standalone app; the product is a pnpm workspace. After it runs:
- **Remove what belongs to the workspace root:** a nested `pnpm-workspace.yaml`, a lockfile, a
  `.git/`, an `.npmrc`. Merge any `onlyBuiltDependencies` into the root's.
- **Name the package `web`,** with `"private": true`, so `pnpm --filter web` and `apps/*` find it.
- **Add a root script:** `"dev:web": "pnpm --filter web dev"`. `pnpm dev` runs only the API.

## The layer GYOS adds

**One folder per context** for that context's pages and components, named like the context,
wherever the framework keeps its own code:
- Vite: `src/<context>/`;
- SvelteKit: `src/lib/<context>/`, with its routes under `src/routes/`;
- Next.js: `src/<context>/`, with its routes under `app/`;
- Nuxt: `app/<context>/`, with its pages under `app/pages/`.

Code shared across contexts holds no domain logic.

**A typed API client per context**, `<context>/api.ts`:
- **Types only:** it imports types from `@module/<context>/contracts` (`import type`), so no
  module runtime reaches the browser. Add the module as a dev dependency of `web`
  (`"@module/<context>": "workspace:*"`).
- **Types come from the build:** the module's types resolve to its built `dist/*.d.ts`, so `web`
  must build the modules first. Add `apps/web/turbo.json`:

  ```json
  { "extends": ["//"], "tasks": { "typecheck": { "dependsOn": ["^build"] }, "build": { "dependsOn": ["^build"] } } }
  ```

  Don't add the `@gyos/source` condition to the web app: it would type-check the module's server
  source with browser types. Unverified until a walking skeleton runs it.
- **The tenant header:** it sends `x-tenant-id` on every call while the host still reads the
  tenant from it, until the product has authentication (`docs/standards/host.md`, H6).

**No domain logic in the frontend.** Rules live in the modules. A page shows what the API returns
and sends what the user did. That is what makes the scenarios, which run below the UI, a fair test
of the product.

**In development, the API runs on its own port.** The host mounts each module at
`/<context>/<area>`, so proxying `/<context>` would swallow a page with the same path. Instead:
- the client calls `/api/...`;
- the dev server proxies `/api` to the API, with the prefix rewritten away (Vite's
  `server.proxy` with `rewrite`, or the framework's equivalent);
- no API URL is hard-coded.
