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

Ask, one question at a time, only what's missing:
- **What was decided,** in one sentence.
- **Why:** the forces in tension, and what it achieves.
- **What it costs:** what is accepted in exchange.
- **What else was considered:** if nothing was, it isn't an ADR, and that's fine.
- **How to know it still holds:** which scenario, test or invariant would fail if the code
  drifted away from it.
- **When to revisit it.**

Never fill a reason in yourself. A decision recorded with an invented reason is worse than none.

## 2. Confront it

Search the Active tables in `.claude/skills/*/development/decisions.md` and the ADRs in
`docs/decisions/` for decisions about the same thing.
- **If one contradicts it,** name it, with file and line, and ask: does the new decision supersede
  it?
- **If yes,** the new entry says `supersedes: <id>`. The old one gets `superseded by: <id>` and
  loses its Active row: those are the only two edits allowed.

## 3. Choose where it goes

| The decision | Goes to | Id |
| --- | --- | --- |
| About one context, no real alternatives weighed | That skill's `development/decisions.md` log, plus an Active row | `<context>-D<n>`, the next free number |
| Spans contexts, a junction, a default, or weighed real alternatives | A new `docs/decisions/NNNN-<title>.md`, plus an Active row in every context it binds | `ADR-NNNN`, the next free number |

Numbers are never reused. Look at the highest existing id, don't guess it.

## 4. Write it

- **The heading** (`### <id> — <title> (<date>)`, or `# ADR-NNNN — …` for an ADR) and the status
  line.
- **The summary sentence:** "In the context of …, facing …, we decided for … (and against …), to
  achieve …, accepting …".
- **Confirmation,** in the README's syntax. It must resolve: the scenario, test or invariant
  exists. If none exists yet, say so and propose one; a decision nothing can check is marked
  `Unverified:`.
- **For an ADR:** Context, Options considered, Consequences.
- **Confidence and the revisit trigger.**

Then:
- **The Active rows:** add them, and remove any superseded row.
- **A rule that will hold for good** (a "must never" about the domain) also becomes an invariant
  `C<n>` in the context's `architecture.md`, with its trap. The decision's Confirmation points at
  it.
- **The ceilings:** if a file is over its ceiling after the write, prune it in the same write, as
  the skill's `workflow.md` says.

If `scripts/gyos-doctor.ts` exists, run it: it checks that every Confirmation resolves. Tell the
user which files you wrote.
