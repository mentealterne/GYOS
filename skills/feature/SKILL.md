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
  skill's `scenarios.md`, it moves from that list into a `.feature` file (BDD + TDD) or into the
  promises table.
- **The example area.** If the module still carries the template's example area (its
  `state-of-the-code.md` says so), the first real feature replaces it: remove the example's code,
  scenarios, tests and table, and generate a migration that drops the table only if no deploy has
  ever run it. Otherwise follow the module standard's expand-only rule. Close the
  `state-of-the-code.md` entry and its todo.
- **Decisions taken on the way** are recorded as the skill's rules say, in the same change.

## 3. Work that spans contexts

1. Each context's part goes through its own skill, in the order the dependency runs: upstream
   first.
2. **The junction belongs to neither.** Name it, and settle its owner before implementing (default:
   the host's composition root, `apps/api/src/modules.ts`). If it's new:
   - write its ADR from `${CLAUDE_PLUGIN_ROOT}/templates/docs/decisions/junction.md`, in the
     format of `docs/decisions/README.md`;
   - link it from the map's Junctions table;
   - add it to each context's Active table.
3. A change to something a context publishes (an operation, a contract type, a published view)
   applies that context's confront rule, even when the request came from the other side.

## 4. Close

**Verify for real,** and report what each command printed:
- `pnpm typecheck`;
- `pnpm test:unit`, `pnpm test:scenarios`;
- `pnpm test:integration`, if adapters or migrations changed;
- `node scripts/gyos-doctor.ts`, if it exists.

**Summarize:**
- what changed, per context;
- which promises were added or changed;
- which decisions were recorded;
- which `development/` files were written;
- what was deferred, and where it was written down.

Don't commit unless the user asks.
