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

**The plugin's files are in `${CLAUDE_PLUGIN_ROOT}`.** The reference files below write that root
as `$P`. `$P` is not a shell variable: in every command, write out the full path above.

## Rules

1. **Where you can, run a script or copy a template.** The templates and scripts under `$P` produce
   the workspace, the modules and the copied standards. You write only what needs knowledge:
   glossaries, invariants, scenarios, decisions, domain code.
2. **Show the plan before writing,** and stop at every checkpoint until the user says go.
3. **Never overwrite the user's files.** GYOS's files are:
   - those with a GYOS header;
   - those init copied from `$P/templates/`, which still match their template.

   Any other file is the user's: ask before writing next to it, or to it.
4. **Never invent.** Every term, rule and promise comes from the context map, which comes from the
   user.
   - A slot no answer covers gets `—`, or `Unverified:` with the question added to the map. It
     never gets a plausible filler.
   - A reason, a cost or a trade-off is asked for, never written in.
5. **Report real results.** When you say a check passes, you ran it and saw it pass. When one
   fails, fix it or say so with the error.
6. **No commits unless the user asks.** Suggest one commit per phase, with a message.

## Where you are

**First, is this a product GYOS has started?** It is when `docs/context-map.md` exists with a GYOS
header. If it isn't, stop in two cases:
- **The repo already holds application code** (a `src/`, apps, or a `package.json` with
  dependencies). Adopting an existing codebase isn't available yet: say so, and stop.
- **The directory isn't a git repository.** Ask whether to run `git init`.

**Then resume** at the first phase that isn't done, and tell the user where you are:

| Phase | Done when |
| --- | --- |
| 1. Discover | `docs/context-map.md` holds every context with its classification, glossary, invariants and examples, and its junctions with their owners, and the user has confirmed it |
| 2. Decide | `docs/decisions/README.md` and `0001-stack.md` to `0004-language.md` exist |
| 3. Scaffold | All of these: every context to build has `modules/<context>/` and a skill that passes the doctor; every junction has its ADR; `AGENTS.md` and `scripts/gyos-doctor.ts` exist; `apps/web/` exists if a frontend was chosen; `pnpm install` has run |
| 4. Walking skeleton | One promise passes end to end, ADR-0002's Confirmation names it, and every check is green |

## Phase 1: Discover

Run `/gyos:discover` (invoke the `gyos:discover` skill), passing the product idea if the user gave
it. Follow it **through its step 8**, not only to its first checkpoint. Scaffolding needs:
- each context's classification, since a bought context gets no module;
- each context's glossary, invariants and examples;
- each junction's owner.

**Checkpoint.** The user confirms the map is settled enough to build. It can still be refined
later, with `/gyos:discover` and `/gyos:context`.

## Phase 2: Decide

**Ask one question at a time,** with your recommendation first. Use AskUserQuestion when it is
available.

1. **Who builds it:** one person or a team, and how big. ADR-0001's context needs it.
2. **Frontend:** React, Svelte, Vue, or none (API only)? Then: does it need server-side rendering
   or SEO? [references/frontends.md](references/frontends.md) gives the scaffolder for each answer.
3. **Testing style:**
   - **BDD + TDD** (recommended): Cucumber scenarios as the outer loop, test-first Vitest inside;
   - **TDD only:** Vitest, no Gherkin;
   - **Pragmatic:** tests required, in any order.

   Ask what drives the choice: who reads the promises, and how much ceremony the team accepts.
   Reasons: `$P/knowledge/bdd-and-testing.md`.
4. **Logger:** none, pino (recommended), pino with OpenTelemetry, or the team's own. If it isn't
   "none", ask the follow-ups in `$P/knowledge/ports-and-adapters.md`, "What /gyos:init asks when
   choosing a logger", one at a time.
5. **Business terms in code.** If the business speaks English, there is nothing to choose: the
   ADR records that the business terms are the code names. Otherwise, ask whether to:
   - translate identifiers into English and keep the original in each glossary (recommended);
   - keep the business terms in code.
6. **The defaults.** Show the Decision table of `$P/templates/docs/decisions/0001-stack.md`, the
   stack the templates really build, and ask whether anything must change, and why.
7. **Confidence and when to revisit,** for the four decisions together, in one question. `—` is a
   fine answer.

**Then write the setup ADRs.** Write `docs/decisions/README.md` and `0001-stack.md` to
`0004-language.md` from `$P/templates/docs/decisions/`:
- fill each slot from the answers; a slot no answer covers gets `—`;
- remove the `<!-- gyos: … -->` comments;
- record a changed default, and its reason, in `0001-stack.md`;
- **ADR-0002's Confirmation** can't name its scenario yet: write
  `Confirmation: Unverified: the walking skeleton's first scenario (or test)`. Phase 4 replaces it.

**Checkpoint.** Show the four decisions in one short list.

## Phase 3: Scaffold

**First, the plan.** List:
- every directory and file you will create;
- every command you will run (the scaffolders, `pnpm install`, `docker compose`);
- the contexts that will get no module (below).

Wait for the user's go.

The steps, in order, are in [references/scaffold.md](references/scaffold.md). In short:
1. the workspace, the standards, `.env`, the doctor, the workspace checks and the API host, from
   templates and scripts;
2. for each context:
   - its module, with `new-module.ts`;
   - its domain skill, from `templates/skill/`;
   - its knowledge, moved out of the context map;
3. the junction ADRs, through `/gyos:decide`'s questions, plus `AGENTS.md` and `CLAUDE.md`;
4. the frontend, with the official scaffolder;
5. install, the database, and the first checks.

**A generic context that the user decided to buy** (identity, payments, email) gets no module of
its own. Each module that needs it declares a port, in its own words, and the adapter calls the
vendor. Record this in the context map and in the consuming modules' skills.

**The example area is scaffolding, not product truth.** Every scaffolded module is born with the
template's example behaviour, renamed to the context's main concept:
- create, list, rename;
- a name unique per tenant;
- its routes;
- with BDD + TDD or not, its example `.feature` files.

None of that was decided by the user. For each module, until a real feature replaces it:
- write it into the skill's `state-of-the-code.md` as known debt;
- add an entry to its `development/todo.md`;
- never list those rules as invariants or promises.

**Checkpoint.** Say which checks ran and what each printed: install, typecheck, unit tests, the
doctor.

## Phase 4: Walking skeleton

**One thin slice, end to end, proves that every part is wired.**

1. **Choose the slice.** Pick the context, a core one if there is one, and the simplest real
   promise among the promises not built yet in its `scenarios.md`. Confirm both with the user.
2. **Build it with `/gyos:feature`'s steps** (invoke the `gyos:feature` skill). It follows the
   context's own Change protocol, test first, through the controller, the route in `apps/api` and
   the page in `apps/web`.

   The slice replaces the module's example area, as `/gyos:feature`'s "The example area" says.
   Nothing has been deployed yet, so the module's `drizzle/` folder is deleted and regenerated, and
   the example routes go. Close its `state-of-the-code.md` entry and its todo. The promise leaves
   the "not built yet" list.
3. **Verify, for real.** Run every check, and report what each one printed:
   - `pnpm typecheck`, `pnpm build`;
   - `pnpm test:unit`, `pnpm test:scenarios`;
   - `pnpm test:integration`, with `TEST_DATABASE_URL`;
   - `pnpm dev`, with the slice exercised over HTTP, and the page;
   - `node scripts/gyos-doctor.ts`.
4. **Close the knowledge.**
   - **ADR-0002:** its Confirmation now names the slice's scenario, or its test.
   - **The trace:** it is now real in that skill's `architecture.md`. Remove its `Unverified:`
     line once every path in it exists.
   - **The rest:** record the decisions taken during the slice, and write the skill's
     `development/qa-checklist.md`.

**Done** when every check is green. Then summarize:
- what exists;
- which checks ran, with their results;
- the open questions still in the map;
- what to run next: `/gyos:feature` for the next promise, `/gyos:context` for a new context.
