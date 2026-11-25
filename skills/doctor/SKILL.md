---
name: doctor
description: >
  Checks that a product GYOS set up is still in shape: every module has a domain skill, every
  skill matches the domain skill standard (files, activation, glossary, invariants, workflow,
  ceilings), every decision's Confirmation still resolves, scenarios are indexed, links work. Then
  explains what it found and offers the fixes. Use when the user runs /gyos:doctor, asks whether
  the skills or the knowledge are up to date, or before a release.
---

# Doctor

You check a product's knowledge against `docs/standards/domain-skill.md`, the same way its CI does,
and then help fix what's wrong. A script does the checking, deterministically. Your part is to
explain the findings, cover the few checks a script can't make, and propose fixes.

## 1. Run the checks

```sh
node scripts/gyos-doctor.ts --json
```

**If the product has no `scripts/gyos-doctor.ts`,** run the plugin's copy on it instead:
`node ${CLAUDE_PLUGIN_ROOT}/scripts/gyos-doctor.ts . --json`. Then offer to copy it into
`scripts/` so the product's CI can run it too, and copy it only if the user agrees.

**Is the product's copy out of date?** The JSON output carries the script's `version`. Compare it
with `node ${CLAUDE_PLUGIN_ROOT}/scripts/gyos-doctor.ts . --json`. If the plugin's is newer, say so,
run both, and offer to update the product's copy.

## 2. Explain

Group the findings by skill: failures first, then warnings, then notes. One line per finding:
what it means, and how to fix it.

| Finding | What it usually means |
| --- | --- |
| Not a GYOS product, or no skills found | The wrong directory, or a product not set up with GYOS |
| A module has no domain skill | A context was added without `/gyos:context` |
| A `{{slot}}` or `<!-- gyos:` remains | Generation stopped half-way |
| A vocabulary term isn't a core term | The activation words and the glossary drifted |
| A Confirmation doesn't resolve | A scenario was renamed or deleted, or an invariant renumbered. **The decision may no longer hold:** that's a question for the user, not a typo |
| A superseded decision is still active | Someone changed their mind and forgot the second edit |
| A log heading can't be parsed | A decision the doctor can't see; its status may be read wrongly until it is fixed |
| A file is over its ceiling | It needs pruning: a judgement, not a mechanical edit |
| A trace names a missing file | The code moved and the trace is stale; it fails unless the trace is marked `Unverified:` |
| Notes: `Unverified:`, token counts | Claims nobody has checked yet; the measured size of each load set |

## 3. What the script can't check

Read the skills for these, and report them as your own findings, clearly labelled as such:
- **Neighbours** are named only in `glossary.md`, `SKILL.md` and `architecture.md`, never as a
  list in `workflow.md`.
- **No core file reads as generic.** Every one says something true of this context and of no
  other.
- **`workflow.md` is specialized:** the clarify dimensions, gates and standing risks are this
  context's, and the Change protocol matches `docs/decisions/0002-testing-style.md`.
- **Promises** in `scenarios.md` name no files, functions or types.

## 4. Fix, with consent

- **Mechanical fixes:** a stale link, a missing index line in `scenarios.md`, a superseded row
  still in an Active table, the token counts in `SKILL.md`, a log heading in the wrong form.
  Propose them as one list, and apply them when the user says go.
- **Fixes that need judgement or knowledge:** pruning a file over its ceiling, a Confirmation that
  no longer resolves, an invariant without its trap, a term to define. Propose each one separately,
  and ask the user, one question at a time. Never invent the answer.
- **A module without a skill:** suggest `/gyos:context`.

**After fixing,** run the script again and report its last line. Don't commit unless the user
asks.
