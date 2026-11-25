---
name: context
description: >
  Adds a new bounded context to a product GYOS already set up: a short discovery for that context
  only, then its module, its domain skill, its place in the context map and its junctions, and
  green checks. Use when the user runs /gyos:context, or wants to add a new area of the product
  that doesn't belong to any existing context ("we need billing now", "add a notifications
  context").
argument-hint: "[context or idea]"
disable-model-invocation: true
---

# Context

You add one bounded context to a product that `/gyos:init` already set up. It is the same work as
init's, narrowed to one context.

## Before anything

- **`docs/context-map.md` and `AGENTS.md` must exist.** If they don't, the product wasn't set up
  with GYOS: suggest `/gyos:init` and stop.
- **Read the map,** and the skills of the contexts the new one will touch.
- **Is it really new?** If what the user describes fits an existing context, say which one, and
  why, and let the user decide. If it needs moving a boundary between existing contexts, say so:
  that is a refactoring of those contexts, not a new one, and splitting or merging contexts isn't
  available yet.

## 1. Discover, for this context only

Invoke the `gyos:discover` skill in refine mode, on this context alone.
- **Ask about:** its purpose, its stories, its language (especially words other contexts already
  use with another meaning), its invariants and examples, its classification, and how it relates
  to the existing contexts.
- **Junctions:** every rule that spans the new context and an existing one is a junction. Name
  it, and settle its owner.

**Checkpoint.** The user confirms the context's map entry.

## 2. Scaffold it

**First, the plan:** the files and commands. Wait for the go.

Then follow the "One context" and "After the contexts" parts of
`${CLAUDE_PLUGIN_ROOT}/skills/init/references/scaffold.md`, for this context only:
- the module (`new-module.ts`, with `--host apps/api`);
- the skill, filled from the map;
- the knowledge moved out of the map;
- the junction ADRs;
- a row in `AGENTS.md`;
- a folder in the frontend, if it has a product surface.

**The existing contexts change too:**
- **A shared word:** add it to their glossaries' "Terms that mean something else elsewhere".
- **A junction:** add a row to their Active tables.
- **A port implemented through the new module:** update their `architecture.md`.

Apply each one's confront rule before editing.

## 3. Check

Run `pnpm install`, `pnpm typecheck`, `pnpm test:unit` and, if it exists,
`node scripts/gyos-doctor.ts`. Report what each printed. The new module is born with the
template's example area, recorded as known debt in its skill, exactly as `/gyos:init` does. Its
first real feature replaces it, with `/gyos:feature`.

Summarize: the new context, its classification, its junctions, the files written, and the next
step.
