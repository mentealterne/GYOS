---
name: init
description: >
  Sets up a new product with GYOS, from a product idea to a modular monolith where every check
  passes: runs the discovery interview, asks the few technical choices that really vary, scaffolds
  the workspace, one module and one domain skill per bounded context, the API host and the
  frontend, and finishes with a walking skeleton. Resumable: it picks up where it stopped. Use when
  the user runs /gyos:init or asks GYOS to set up, bootstrap or start a new product.
argument-hint: "[product idea]"
disable-model-invocation: true
---

# Init

You take a product from an idea to a working, well-bounded codebase in four phases:
**Discover → Decide → Scaffold → Walking skeleton**.
- Each phase ends at a checkpoint where the user reviews the result.
- Each phase can be re-run on its own.
- You work out where you are from the files that exist, not from a state file.

## Rules

1. **Where you can, run a script or copy a template.** Templates and scripts under
   `${CLAUDE_PLUGIN_ROOT}` produce the workspace, the modules and the copied standards. You write
   only what needs knowledge: glossaries, invariants, scenarios, decisions, domain code.
2. **Show the plan before writing,** and stop at every checkpoint until the user says go.
3. **Never overwrite the user's files.** A file without a GYOS header is theirs. Ask before
   writing next to it, or to it.
4. **Never invent.** Every term, rule and promise comes from the context map, which comes from the
   user. A slot you can't fill from confirmed knowledge gets `Unverified:` or becomes an open
   question in the map; it never gets a plausible filler.
5. **Report real results.** When you say a check passes, you ran it and saw it pass. When one
   fails, fix it or say so with the error.
6. **No commits unless the user asks.** Suggest one commit per phase, with a message.

## Where you are

Check in this order, and resume at the first phase that isn't done. Tell the user where you are.

| Phase | Done when |
| --- | --- |
| 1. Discover | `docs/context-map.md` exists and the user has confirmed its contexts |
| 2. Decide | `docs/decisions/0001-stack.md` to `0004-language.md` exist |
| 3. Scaffold | Every context to be built has `modules/<context>/` and `.claude/skills/<context>/SKILL.md` |
| 4. Walking skeleton | One promise passes end to end, and every check is green |

**Stop at once in two cases:**
- **The repo already holds a product** (application code, a `package.json` with dependencies, a
  `src/` that GYOS didn't write). Say that adopting an existing codebase is not available yet, and
  stop.
- **The directory isn't a git repository.** Ask whether to run `git init`.

## Phase 1: Discover

Run `/gyos:discover`: invoke the `gyos:discover` skill, passing the product idea if the user gave
it. Follow it until the user confirms the contexts. It writes `docs/product-brief.md` and
`docs/context-map.md`.

**Checkpoint.** The user confirms the contexts are settled enough to build. They can still be
refined later, with `/gyos:discover` and `/gyos:context`.

## Phase 2: Decide

**Ask one question at a time,** with your recommendation first. Use AskUserQuestion when it is
available.

1. **Frontend:** React, Svelte, Vue, or none (API only)? Then: does it need server-side rendering
   or SEO? The table in [references/frontends.md](references/frontends.md) gives the scaffolder
   for each answer.
2. **Testing style:**
   - **BDD + TDD** (recommended): Cucumber scenarios as the outer loop, test-first Vitest inside;
   - **TDD only:** Vitest, no Gherkin;
   - **Pragmatic:** tests required, in any order.

   Reasons: `${CLAUDE_PLUGIN_ROOT}/knowledge/bdd-and-testing.md`.
3. **Logger:** none, pino (recommended), pino with OpenTelemetry, or the team's own. If it isn't
   "none", ask the follow-ups in `${CLAUDE_PLUGIN_ROOT}/knowledge/ports-and-adapters.md`, "What
   /gyos:init asks when choosing a logger", one at a time.
4. **Business terms in code.** Ask only if the business doesn't speak English. Either translate
   identifiers into English and keep the original in each glossary (recommended), or keep the
   business terms in code.
5. **The defaults.** Show the table in `${CLAUDE_PLUGIN_ROOT}/docs/plan.md`, "Everything else has a
   default", and ask whether anything must change, and why.

**Then write the setup ADRs.** Write `docs/decisions/README.md` and `0001-stack.md` to
`0004-language.md` from `${CLAUDE_PLUGIN_ROOT}/templates/docs/decisions/`:
- fill every slot from the answers;
- remove the `<!-- gyos: … -->` comments;
- record a changed default, and its reason, in `0001-stack.md`.

**Checkpoint.** Show the four decisions in one short list.

## Phase 3: Scaffold

**First, the plan.** List every directory and file you will create, every command you will run,
and the contexts that will get no module (below). Wait for the user's go.

The steps, in order, are in [references/scaffold.md](references/scaffold.md). In short:
1. the workspace, the standards and the workspace architecture tests, from templates and scripts;
2. the API host;
3. for each context, its module (`scripts/new-module.ts`), its domain skill (from
   `templates/skill/`), and its knowledge moved out of the context map;
4. the junction ADRs, `AGENTS.md`, `CLAUDE.md`, the doctor script;
5. the frontend, with the official scaffolder;
6. install, the database, and the first checks.

**A generic context that the user decided to buy** (identity, payments, email) gets no module of
its own. Each module that needs it declares a port, in its own words, and the adapter calls the
vendor. Record this in the context map and in the consuming modules' skills.

**The example area is scaffolding, not product truth.** Every scaffolded module is born with the
template's example behaviour, renamed to the context's main concept:
- create, list, rename;
- a name unique per tenant.

None of that was decided by the user. For each module, until a real feature replaces it:
- write it into the skill's `state-of-the-code.md` as known debt;
- add an entry to its `development/todo.md`;
- never list those rules as invariants or promises.

**Checkpoint.** Say which checks ran and their results: install, typecheck, unit tests,
architecture tests.

## Phase 4: Walking skeleton

**One thin slice, end to end, proves that every part is wired.**

1. **Choose the slice.** Pick the context, a core one if there is one, and the simplest real
   promise from its examples. Confirm both with the user.
2. **Build it.** Follow that context's skill, `.claude/skills/<context>/workflow.md`, Change
   protocol:
   - example mapping;
   - a failing scenario (or test, depending on the testing style);
   - the domain rule, the use case, the port and adapter, and a migration;
   - the controller operation, the route in `apps/api`, and the page in `apps/web`.

   The slice replaces the example area's behaviour in that module, so its `state-of-the-code.md`
   entry goes.
3. **Verify, for real.** Run every check, and report what each one printed:
   - `pnpm typecheck`, `pnpm build`;
   - `pnpm test:unit`, `pnpm test:scenarios`;
   - `pnpm test:integration`, with `TEST_DATABASE_URL`;
   - the API from source, with the slice exercised over HTTP;
   - the page;
   - `node scripts/gyos-doctor.ts`, if it exists.
4. **Close the knowledge.**
   - In that skill's `architecture.md`, the trace is now real: remove its `Unverified:` line once
     every path in it exists.
   - Record the decisions taken during the slice.
   - Write the skill's `development/qa-checklist.md`.

**Done** when every check is green. Then summarize:
- what exists;
- which checks ran, with their results;
- the open questions still in the map;
- what to run next: `/gyos:feature` for the next promise, `/gyos:context` for a new context.
