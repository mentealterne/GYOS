# Scaffold: the steps

Phase 3 of `/gyos:init`, step by step. `/gyos:context` runs the "One context" part of it for a
context added later.

`$P` stands for `${CLAUDE_PLUGIN_ROOT}`. Run every script from the product's root, with `node`.

---

## The workspace

1. **Copy `$P/templates/workspace/` to the product root.**
   - A file that already exists and doesn't carry a GYOS header is the user's: ask before writing
     next to it, or to it.
   - Merge `.gitignore` line by line.
   - In the root `package.json`, set `name` to the product's kebab-case name.
2. **Copy the standards:** `node $P/scripts/copy-standards.ts .` writes `docs/standards/module.md`,
   `docs/standards/host.md` and `docs/standards/domain-skill.md`.
3. **The environment:** copy `.env.example` to `.env`. Its values match `docker-compose.yml`: the
   development database, and a test database whose name contains "test", which is the only kind
   the integration tests agree to wipe. `.env` stays out of git.
4. **Copy the workspace checks:** `$P/templates/tooling-architecture/` → `tooling/architecture/`.
5. **Copy the host:** `$P/templates/apps/api/` → `apps/api/`. Adapt `src/logger.ts` to
   `docs/decisions/0003-logger.md`:
   - **none:** the host logs to the console, and no logger is injected into the modules;
   - **pino:** as the template;
   - **pino with OpenTelemetry:** the template's comment says what to add;
   - **the team's own:** an adapter from it to the modules' logger port.

## One context

For each context in the map that gets a module, in the map's order:

1. **The module.**

   ```sh
   node $P/scripts/new-module.ts . <context> --area <area> --entity <entity> --host apps/api
   ```

   - `<area>` is the context's main concept in the plural, and `<entity>` in the singular, both
     kebab-case: `treatment-plans`, `treatment-plan`.
   - Take them from the context's glossary in the map, named as
     `docs/decisions/0004-language.md` says, and confirm them with the user.
   - The script refuses invalid or existing names. Never work around a refusal: ask.
2. **The skill.** Copy `$P/templates/skill/` to `.claude/skills/<context>/`, then fill it as
   `docs/standards/domain-skill.md` says, from the context's entry in `docs/context-map.md`:

   | File | Filled from |
   | --- | --- |
   | `SKILL.md` | Purpose, top vocabulary, boundaries, question shapes. The `description` and `when_to_use` together stay under 1,536 characters, key use first |
   | `glossary.md` | The map's draft glossary, with a code name for each term (per ADR 0004) and the file that codifies it, once it exists |
   | `architecture.md` | The map's invariants, as `C1`, `C2`, … with their traps; the classification; the module's areas, published language and required ports |
   | `workflow.md` | The template as it is, with this context's clarify dimensions, gates and standing risks filled in, and the testing-style variant from ADR 0002 applied |
   | `testing.md` | The module's real commands, with the scenario row dropped unless the style is BDD + TDD |
   | `scenarios.md` | Created when the context has a product surface. The map's examples go under "Out of scope and known gaps" as promises not built yet, with their real values. `/gyos:feature` turns each one into a `.feature` file when it builds it |
   | `state-of-the-code.md` | The example-area entry: the module's example behaviour (create, list, rename, a name unique per tenant) came from the GYOS template, isn't a product decision, and must be replaced or removed before release |
   | `development/decisions.md` | The Active table with the four setup ADRs; an empty log |
   | `development/todo.md` | One entry: replace the example area. Urgent when the first real feature of this context is built, and before any release |

   **No `{{` and no `<!-- gyos:` may remain.** A slot without confirmed knowledge gets
   `Unverified:` or `—`, and its question goes to the map.
3. **Move the knowledge out of the map.** In the context's map entry, replace the draft glossary,
   the invariants and the examples with links to the skill's files. From now on, the skill is
   where they live.

## After the contexts

1. **Junctions.** For each junction in the map, write an ADR in `docs/decisions/` from
   `$P/templates/docs/decisions/junction.md`, numbered after the last one.
   - Link it from the map's Junctions table.
   - Add a row to the Active table of each context it binds.
   - Its owner is the host's composition root unless the map says otherwise: wire it in
     `apps/api/src/modules.ts` once both sides exist, or record it in `todo.md` until then.
2. **`AGENTS.md`** from `$P/templates/docs/AGENTS.md`, with one row per context. A root
   `CLAUDE.md` containing the single line `@AGENTS.md`.
3. **The doctor.** Copy `$P/scripts/gyos-doctor.ts` to `scripts/gyos-doctor.ts`. The product's CI
   runs it.
4. **The frontend,** per [frontends.md](frontends.md), into `apps/web/`.

## Install and first checks

```sh
pnpm install
docker compose up -d     # Postgres; if Docker isn't available, say so and give the user the command
pnpm typecheck
pnpm test:unit
node scripts/gyos-doctor.ts
```

The doctor is expected to report, at this point:
- the `Unverified:` traces, as notes;
- nothing else.

A failure means a skill was filled wrongly: fix it before the checkpoint.

If a check fails, fix the cause; never weaken the check. Report what each command printed.
