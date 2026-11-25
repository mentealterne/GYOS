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

**Scaffolders change their flags between versions.** Before running one, run it with `--help` and
pass the flags that make it non-interactive: TypeScript on, no example content, pnpm as the
package manager, no git init, since the product already is a repo. If a prompt can't be answered
by a flag, ask the user, then run the command.

## The layer GYOS adds

- **One folder per context**, named like the context (`src/<context>/`), holding that context's
  pages and components. Code shared across contexts lives in `src/shared/` and holds no domain
  logic.
- **A typed API client per context,** `src/<context>/api.ts`:
  - it imports types only from `@module/<context>/contracts` (`import type`), so no module runtime
    reaches the browser;
  - it calls the routes in `apps/api`.

  Add the module as a dependency of `apps/web` (`"@module/<context>": "workspace:*"`) so the types
  resolve.
- **No domain logic in the frontend.** Rules live in the modules. A page shows what the API
  returns and sends what the user did. That is what makes the scenarios, which run below the UI,
  a fair test of the product.
- **In development, the API runs on its own port.** Point the frontend at it with the dev server's
  proxy (Vite's `server.proxy`, or the framework's equivalent) rather than hard-coding a URL.
