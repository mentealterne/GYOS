---
name: feature
description: >
  Builds a feature in a product GYOS set up, the Knowledge-Driven way: finds the bounded contexts
  it touches, hands the work to their domain skills, confronts it with the recorded decisions and
  promises, then example mapping, a failing scenario, test-first implementation, real checks, and
  the knowledge updated in the same change. Use when the user runs /gyos:feature, or asks to build,
  add or change a behaviour of the product ("add late fees", "patients can cancel online") and
  the work spans more than a one-line fix.
argument-hint: "[what the feature should do]"
---

# Feature

The daily driver. A request for behaviour comes in; it leaves as code, tests and knowledge that
agree with each other. The domain skills do the work; you route it to them and hold the parts that
belong to none of them.

## Before anything

`AGENTS.md`, `docs/context-map.md` and `.claude/skills/` must exist. If they don't, the product
wasn't set up with GYOS: suggest `/gyos:init` and stop.

## 1. Find the contexts

Read only the context map and the glossaries of the candidate contexts, never every skill. Match
the request's words against the glossaries and the map's purposes.

| The request touches | Do |
| --- | --- |
| One context with a skill | Hand over to that skill (step 2) |
| Several contexts | Split the request into one part per context, plus the junctions between them (step 3) |
| Something no context owns | Say so. If it carries its own language and rules, suggest `/gyos:context`; if it's plumbing, work it with the ordinary tools |
| Words with two meanings across contexts | Ask which one the user means before anything else |

Tell the user, in one line, which contexts you will work in and why.

## 2. Hand over to the domain skill

Invoke the context's skill and follow its `workflow.md` Change protocol, step by step. Don't run
a lighter version of it: clarify, load, confront, gap analysis, example mapping, a failing
scenario or test, implement, verify, update knowledge, record.

What you add on top:

- **The gap analysis is shown before any code:** what exists, what's missing, which files will
  change, which promises and decisions are involved. The user says go.
- **Pending promises.** If the feature is one of the promises listed as not built yet in the
  skill's `scenarios.md`, it leaves that list.
  - **With BDD + TDD,** it becomes a `.feature` file, plus a row in the `scenarios.md` index.
  - **With the other styles,** it becomes a promise written in `scenarios.md`, as Given / When /
    Then with real values.
- **The example area.** If the module still carries the template's example area (its
  `state-of-the-code.md` says so), the first real feature replaces it: remove the example's code,
  scenarios, tests and schema table. For the database, **ask the user whether any deploy has run
  this module's migrations.** Never guess. Then follow the module standard
  (`docs/standards/module.md`):
  - **no deploy yet:** delete the module's `drizzle/` folder and run `db:generate`, so the history
    starts from the real schema;
  - **already deployed:** migrations are expand-only. Leave the example table in place, unused,
    and add a todo to drop it in a later deploy, once no running version reads it.

  - **The Gherkin tooling, unless the style is BDD + TDD.** With "TDD only" or "pragmatic"
    (`docs/decisions/0002-testing-style.md`), the example's `features/`, `cucumber.mjs`,
    `tsx-register.js`, the `test:scenarios` script and the Cucumber dependencies go too.

  Then close the `state-of-the-code.md` entry and its todo. If `state-of-the-code.md` ends up
  empty, delete it: the standard allows no empty files.
- **Decisions taken on the way** are recorded as the skill's rules say, in the same change.

## 3. Work that spans contexts

1. Each context's part goes through its own skill, in the order the dependency runs: upstream
   first.
2. **The junction belongs to neither.** Name it, say it belongs to neither context, and **ask the
   user who owns it** before implementing. The default is the host's composition root, where
   `apps/api` builds the modules and wires one module's port to another.
3. **If the junction is new,** record it with `/gyos:decide`'s steps (invoke the `gyos:decide`
   skill). They ask the user for the reasons, the cost and the alternatives, never fill them in,
   and take the next free ADR number. The ADR starts from
   `${CLAUDE_PLUGIN_ROOT}/templates/docs/decisions/junction.md`. Then:
   - link it from the map's Junctions table;
   - add it to each context's Active table.
4. **A change to something a context publishes** applies that context's confront rule, even when
   the request came from the other side. That covers an operation, a contract type, a published
   view, or an event.

## 4. Close

**Verify for real,** and report what each command printed:
- every tier in the `testing.md` of each skill you worked in, with the commands it gives;
- `pnpm typecheck` across the workspace;
- `node scripts/gyos-doctor.ts`, if it exists.

**Summarize:**
- what changed, per context;
- which promises were added or changed;
- which decisions were recorded;
- which `development/` files were written;
- what was deferred, and where it was written down.

Don't commit unless the user asks.
