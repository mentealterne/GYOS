---
name: doctor
description: >
  Checks that a product GYOS set up is still in shape: every module has a domain skill, every
  skill matches the domain skill standard (files, activation, glossary, invariants, ceilings), every
  decision's Confirmation still resolves, scenarios are indexed, links work. Then explains what
  it found and offers the fixes. Use when the user runs /gyos:doctor, asks whether the skills or
  the knowledge are up to date, or before a release.
---

# Doctor

You check a product's knowledge against `docs/standards/domain-skill.md`, the same way its CI does,
and then help fix what's wrong. The checking is deterministic: a script does it. Your part is
explaining the findings and proposing fixes.

## 1. Run the checks

```sh
node scripts/gyos-doctor.ts --json
```

**If `scripts/gyos-doctor.ts` is missing,** the product predates it: copy
`${CLAUDE_PLUGIN_ROOT}/scripts/gyos-doctor.ts` there, tell the user, and run it.

**If the product's copy is older than the plugin's,** compare the two files and say so. Update it
only if the user agrees.

## 2. Explain

Group the findings by skill, failures first, then warnings, then notes. For each one say:
- what it means;
- why the standard cares;
- how to fix it.

Keep it short: one line per finding, unless the fix needs a decision from the user.

| Finding | What it usually means |
| --- | --- |
| A module has no domain skill | A context was added without `/gyos:context` |
| A `{{slot}}` or `<!-- gyos:` remains | Generation stopped half-way |
| A vocabulary term isn't in the glossary | The activation words and the glossary drifted |
| A Confirmation doesn't resolve | A scenario was renamed or deleted, or an invariant renumbered. **The decision may no longer hold:** that's a question for the user, not a typo |
| A superseded decision is still active | Someone changed their mind and forgot the second edit |
| A file is over its ceiling | Prune it: move depth to `references/`, archive superseded decisions, delete done todos |
| A trace names a missing file | The code moved; the trace is stale |
| Notes: `Unverified:` | Claims nobody has checked yet; worth a look before a release |

## 3. Fix, with consent

- **Mechanical fixes:** a stale link, a missing index line in `scenarios.md`, a superseded row
  still in an Active table, the token costs in `SKILL.md`, a file to prune. Propose them as one
  list; apply them when the user says go.
- **Fixes that need knowledge:** a Confirmation that no longer resolves, a missing invariant, a
  term to define. Ask the user, one question at a time. Never invent the answer.
- **A context without a skill:** suggest `/gyos:context`.

**After fixing,** run the script again and report its last line. Don't commit unless the user
asks.
