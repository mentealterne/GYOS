---
name: decide
description: >
  Records a decision in a product GYOS set up, in the right place and format: a context's decision
  log or a project ADR, with its id, its reasons, what it supersedes, and a Confirmation that ties
  it to a scenario, a test or an invariant. Use when the user runs /gyos:decide, says "let's
  decide", "record this decision", "we're changing our mind about…", or a choice was just made
  that the code alone won't explain.
argument-hint: "[the decision]"
---

# Decide

You write one decision down so that the next person, or agent, finds it before contradicting it.
The format is the product's `docs/decisions/README.md`: read it first, and follow it exactly.

## 1. Understand it

`docs/decisions/README.md` must exist. If it doesn't, the product wasn't set up with GYOS:
suggest `/gyos:init` and stop.

Ask, one question at a time, only what's missing:
- **What was decided,** in one sentence.
- **Why:** the forces in tension, and what it achieves.
- **What it costs:** what is accepted in exchange.
- **What else was considered,** if anything. "Nothing" is a valid answer; write it down as such.
- **How to know it still holds:** which scenario, test or invariant would fail if the code
  drifted away from it.
- **When to revisit it.**
- **If it is a lasting rule** (something that must never happen in the domain): what goes wrong
  without it. That is its trap, and it becomes an invariant (step 4).

Never fill a reason in yourself. A decision recorded with an invented reason is worse than none.

## 2. Confront it

Search for anything the decision would contradict:
- the Active tables in `.claude/skills/*/development/decisions.md`, and the ADRs in
  `docs/decisions/`;
- the promises in the affected skills' `scenarios.md` and `.feature` files;
- the invariants in their `architecture.md`.

**If something contradicts it,** name it, with file and line, and ask whether the new decision
supersedes it.
- **Yes:**
  - the new entry says `supersedes: <id>`;
  - the old one gets `superseded by: <id>`;
  - its row leaves **every** Active table that lists it.

  Those are the only edits allowed on the old entry. A promise or an invariant that rested on the
  old decision changes too, with the user's consent: the scenario is updated, the invariant is
  marked retired, never renumbered.
- **No:** the two can't both hold. Stop and ask the user to reconcile them: reword the new
  decision, or drop it. Never record two decisions that contradict each other.

## 3. Choose where it goes

| The decision | Goes to | Id |
| --- | --- | --- |
| About one context, no real alternatives weighed | That skill's `development/decisions.md` log, plus an Active row | `<context>-D<n>`, the next free number |
| Spans contexts, is a junction, changes a default, or weighed real alternatives | A new `docs/decisions/NNNN-<title>.md`, plus an Active row in every context it binds | `ADR-NNNN`, the next free number |

**Numbers are never reused.** Look up the highest existing id, never guess it: in the context's
`decisions.md`, its `decisions-archive.md`, and every file in `docs/decisions/`.

## 4. Write it

- **The heading** (`### <id> — <title> (<date>)`, or `# ADR-NNNN — …` for an ADR) and the status
  line.
- **The summary sentence:** "In the context of …, facing …, we decided for … (and against …), to
  achieve …, accepting …".
- **Confirmation,** in the README's syntax. It must resolve: the scenario, test or invariant
  exists. If none exists yet, write `Confirmation: Unverified: <the check that should be added>`,
  and add that check to the context's `development/todo.md`. Never point a Confirmation at a
  scenario or test that doesn't exist.
- **For an ADR:** Context, Options considered, Consequences.
- **Confidence and the revisit trigger.**

Then:
- **The Active rows:** add them, and remove any superseded row.
- **A junction:** also add its row to the Junctions table in `docs/context-map.md`, linking the
  ADR.
- **A lasting rule** becomes an invariant in the context's `architecture.md`, **with the user's
  consent**:
  - its number is the highest `C<n>` in that file plus one, retired numbers included;
  - its trap is the one the user gave in step 1;
  - the decision's Confirmation points at it.
- **The ceilings:** if a file is over its ceiling after the write, say so. Pruning an Active table
  means turning decisions into invariants or ADRs, which needs the user's consent; propose it,
  don't do it silently.

If `scripts/gyos-doctor.ts` exists, run it: it checks that every Confirmation resolves. Tell the
user which files you wrote.
