# Standard: the host

The rules the host app keeps: `apps/api`, the one deployable of a GYOS product, which composes the
modules and owns HTTP. The modules follow [`module.md`](module.md); this file covers what sits
around them. The template that implements it is `templates/apps/api`, and
`scripts/verify-templates.ts` proves it: it scaffolds the host with two modules, runs its tests,
starts it from source and from the build (with `NODE_ENV=test`: a production host refuses the
tenant placeholder, H6), sends it HTTP requests and stops it with `SIGTERM`, in CI too. A statement here marked **verified** was run that way.

Versions were checked on 2026-11-25: Express 5.3, pino 10.4, Zod 4.6.

---

## The tree

```
apps/api/
├── package.json                 "api": the modules as workspace:* dependencies
├── tsconfig.json                typecheck: src (tests included)
├── tsconfig.build.json          src → dist against the modules' build, skipLibCheck off
├── vitest.config.ts             unit: src/tests/unit, the routes on fakes of the modules
├── vitest.config.integration.ts integration: every module on a real Postgres
└── src/
    ├── main.ts                  the composition root
    ├── config.ts                the environment, validated: the only reader of process.env
    ├── logger.ts                pino, and the adapter to the modules' logger port
    ├── modules.ts               builds every module once; the junctions
    └── http/
        ├── app.ts               createApp: probes, JSON body, routes, error middleware
        ├── errors.ts            how an error becomes a status
        ├── server.ts            listen, and a graceful close
        ├── tenant.ts            where the tenant of a request comes from: a placeholder header
        └── routes/
            ├── index.ts         mounts each module's routes at /<module>
            └── <module>.ts      one per module: thin routes, and the module's error map
```

---

## Rules

**H1. `main.ts` is the composition root.** In this order: configuration (and the tenant source,
H6), logger, one `pg` pool, every module (once, in `modules.ts`), every module's `ready()`, then
listen. Nothing else in the host builds a module, a pool or a logger. A worker or a script that runs module code is a host
too, and follows the same order.

**H2. Junctions live in `modules.ts`.** A rule that spans two modules belongs to neither. The
module that needs something declares a port in its own language, and `modules.ts` implements it
by calling the other module, so neither imports the other (module.md, M10 and Junctions). The
module that provides is built first. Each junction is named in a comment and documented once in
`docs/context-map.md`.

**H3. `config.ts` is the only file that reads `process.env`.** It validates every variable with
Zod and throws one error that lists every problem, so a bad deploy fails at boot with one complete
message. It never echoes a value: `DATABASE_URL` holds a password. A variable set to an empty
string counts as not set. The modules get values, never the environment (module.md, M6). A unit
test fails on any other read, however it is spelled.

| Variable | Default |
| --- | --- |
| `DATABASE_URL` | required: a `postgres://` URL, direct or through a session-mode pooler (module.md, Running migrations) |
| `PORT` | `3000`; `0` lets the system choose |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production`; `development` turns on readable logs |
| `LOG_LEVEL` | `info` |
| `DATABASE_POOL_MAX` | `10` |
| `SHUTDOWN_TIMEOUT_MS` | `10000` |
| `TENANT_FROM_HEADER` | `true`, except in production: the tenant placeholder (H6). `true` or `false` |

**H4. One logger, built once, adapted to the modules' port.** `logger.ts` builds pino and adapts
it to the port every module declares (`error` takes an `Error` too, `child` keeps bindings). The
modules never import pino. pino-pretty is a dev dependency and runs only when `NODE_ENV` is
`development`. Adding OpenTelemetry (`@opentelemetry/instrumentation-pino`) changes how the
process starts, not the adapter; the comment in `logger.ts` says what to change. That path is
**not verified**.

**H5. No request before every module is ready.** `main.ts` awaits every module's `ready()`, which
migrates its schema, before it listens (module.md, M8). They are awaited at once: the shared lock
runs the migrations one at a time.
- `GET /health` is liveness: it answers while the process runs, and checks nothing else.
- `GET /ready` is readiness: 200 once every `ready()` has resolved, 503 while one hasn't or while
  the process is shutting down.

**H6. Routes are thin.** A route reads the request (the tenant, the path parameters, the body),
calls **one** operation of one module's controllers, and shapes the response. It holds no rule and
no validation: the module parses its own input. A route file per module, `routes/<module>.ts`,
mounted at `/<module>`. The tenant comes from `tenant.ts` alone: a header until the product has
authentication, then the session. A use case that needs two modules is a junction (H2) or an
operation of one module, never a route that calls two.
- **The `x-tenant-id` header is not authentication.** Any caller can name any tenant, and read or
  write its data. It is a development placeholder, so the routes can be called before the product
  has authentication: `TENANT_FROM_HEADER` turns it on, by default everywhere but production. A
  host whose `NODE_ENV` is `production` refuses to start while `tenant.ts` is the placeholder, and
  says to replace it with authentication; so does a host with `TENANT_FROM_HEADER=false`, which
  has no tenant source left. **Verified** on every run: the built host exits with 1 and that
  message under `NODE_ENV=production`.
- The header is checked before any module is called: missing or empty, it is refused with 400
  `missing-tenant`; longer than 128 characters, or holding anything but letters, digits, `.`, `_`
  and `-`, with 400 `invalid-tenant`. The module validates the id again.
- GYOS's doctor (`scripts/gyos-doctor.ts`) warns, without failing, while `tenant.ts` still reads
  the tenant from the header.
- Once the product authenticates its callers, `tenantOf` derives the tenant from the session, never
  from anything the client sends, and `checkTenantSource` checks what the authentication needs, or
  goes.

**H7. Errors map in one place, by kind** (`http/errors.ts`):

| Thrown | Status | Body `error.code` |
| --- | --- | --- |
| Invalid input: the module's `is<Name>InputError` says so | 400, with `issues` | `invalid-input` |
| A refusal: the module's error class, by its `code` | 404, 409 or 422, from the route file's map | the module's code |
| The host's own refusal (`HttpError`), or the JSON parser's | its 4xx | `missing-tenant`, `invalid-tenant`, `invalid-json`, … |
| No route | 404 | `route-not-found` |
| Anything else: a bug | 500, with an `id` | `internal` |

- Every error body has one shape: `{ "error": { "code", "message", "issues"?, "id"? } }`.
- **The refusal map is exhaustive.** `refusals(ErrorClass, { code: status })` must name every code
  of the class: a code the module adds later doesn't compile until the route file maps it.
- **A bug leaks nothing.** The response carries a fixed message and an id; the log line carries the
  same id, the method, the path and the error with its stack.
- A refusal class that no route file maps is a bug, and answers 500.

**H8. Graceful shutdown.** On `SIGTERM` or `SIGINT`: `/ready` turns 503, the server stops accepting
connections, requests in flight get `SHUTDOWN_TIMEOUT_MS` to finish before their connections are
cut, then the pool ends and the logger flushes. The process exits on its own, with 0; a hard
timer exits with 1 if closing hangs. A second signal kills it. **Verified** on every run: the host
logs `stopped` and exits with 0 after `SIGTERM`.

**H9. Modules through their entry points only.** The host imports a module's root entry, its
`./contracts` and its vocabulary subpaths, and declares the module in `package.json`.
`tooling/architecture` checks it, as for any package.

---

## Adding a module

`node scripts/new-module.ts <workspace> <name> --host apps/api` scaffolds the module and adds it to
the host: the dependency in `package.json`, a line above each marker in `modules.ts`
(`// gyos:modules:imports`, `:type`, `:build`, `:return`) and in `routes/index.ts`
(`// gyos:routes:imports`, `:mount`), and `routes/<name>.ts` with its test, rendered from
`templates/host-module`. The markers stay in the files. The script refuses to touch a host whose
markers are missing or doubled, and a second run changes nothing (verified).

---

## Testing

| Tier | Where | Runs against | Proves |
| --- | --- | --- | --- |
| **Unit** | `src/tests/unit/` | The app on an ephemeral port; each module's routes on a fake of the module | Config, the logger adapter, the probes, the error mapping, shutdown, each route's statuses |
| **Integration** | `src/tests/integration/` | Every module, built as `main.ts` builds them, in a database of its own | That every module gets ready on an empty database, and the app reports it |

- **The fakes use only what a module publishes.** A module's in-memory adapters live in its
  `features/support/`, which is not an entry point, so a route test fakes the module's public type
  and parses with its published schemas: invalid input fails the way the module's own does. What
  the module decides is proven in the module.
- **The integration tests create their own database** next to `TEST_DATABASE_URL`'s, and drop it.
  The modules' integration tests drop their schemas on `TEST_DATABASE_URL` at the same time, so
  sharing it would race. That needs the `CREATEDB` privilege, which the Postgres of
  `docker-compose.yml` and of CI have. They refuse a `TEST_DATABASE_URL` whose database name
  doesn't contain `test` or `verify`.

---

## The workspace around it

- `docker-compose.yml`: Postgres 18, a development database and `<name>_test`, created on the first
  start by `docker/postgres/create-test-database.sh`, with a healthcheck. The script was run against
  a local Postgres 16; the compose file itself is **not verified** (`docker compose config` parses
  it).
- `.env.example`: `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `LOG_LEVEL`, `NODE_ENV`, and
  `TENANT_FROM_HEADER` commented out, with what it is. `pnpm dev`
  reads `.env`; other commands read the shell's environment.
- `.github/workflows/ci.yml`: install, typecheck, build, the unit tests, the scenarios, the
  integration tests on a Postgres service, then `node scripts/gyos-doctor.ts` when that file
  exists. Node 24. **Not verified** by a run: GYOS's own CI checks the templates, not this
  workflow.
