# Decision records and agent context

How decisions are written down, how a new request is confronted with them, and how the knowledge
is laid out so that an agent actually loads it. Load this when recording a decision, before
changing behaviour that a decision covers, or when writing `AGENTS.md` or a skill.

Sources were checked on 2026-11-25. Version-dependent details are marked **[version]**.

---

## Why: record, then confront

KDP's operative loop has two halves (see `knowledge-driven-programming.md`):

1. **Record** the decision with its rationale, its trade-offs and its domain context.
2. **Confront** every new request with what was recorded before building.

Without the first, the second has nothing to check against. Without the second, the record is an
archive nobody reads.

---

## The formats GYOS draws on

**Michael Nygard's ADR (2011).**
- **Sections:** Title (a short noun phrase), Context (the forces in tension, described neutrally),
  Decision ("We will…"), Status (proposed, accepted, deprecated, superseded), and Consequences (all
  of them, not only the good ones).
- **Size and numbering:** one or two pages each, numbered in sequence; a number is never reused.
- **Reversals:** a reversed decision is kept and marked superseded.
- **Voice:** written as a conversation with a future developer.

([Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions))

**Martin Fowler (updated 2026).**
- An accepted ADR is never edited, only superseded.
- Write it inverted-pyramid style, with the conclusion first.
- List the serious alternatives that were considered.
- Record your **confidence**, and the **changes in context that should trigger a re-evaluation**.
- Keep ADRs in the repo as Markdown.

([ArchitectureDecisionRecord](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html))

**MADR 4.0.0 (2024-09).**
- **Front matter** is optional: status, date, decision-makers, consulted, informed.
- **Sections:** Context and Problem Statement, Decision Drivers, Considered Options, Decision
  Outcome, Consequences.
- **Confirmation:** a section saying how compliance is checked, for example by a test.

([MADR](https://github.com/adr/madr))

**The Y-statement (Olaf Zimmermann).** One sentence:

> In the context of ⟨X⟩, facing ⟨concern⟩, we decided for ⟨option⟩ (and against ⟨others⟩) to
> achieve ⟨quality⟩, accepting ⟨downside⟩.

([Y-form template](https://socadk.github.io/design-practice-repository/artifact-templates/DPR-ArchitecturalDecisionRecordYForm))

**Store them in source control, not a wiki**, so they change with the code.
([Thoughtworks Radar: lightweight ADRs](https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records))

---

## The GYOS format

The format is a synthesis of the sources above. There are two homes for decisions, and one entry
shape for both.

| Where | Holds |
| --- | --- |
| `docs/decisions/NNNN-<title>.md` | Project-wide decisions: the stack, the defaults, the shape of modules, junction owners |
| `.claude/skills/<context>/development/decisions.md` | One context's decisions, as an append-only log. An entry that had real alternatives gets its own file under `docs/decisions/` and the log links to it |

```markdown
## 0007 — Emails are unique regardless of case (2026-11-25)

Status: accepted · supersedes: 0003 · superseded by: —

In the context of registration, facing duplicate accounts, we decided for case-insensitive
uniqueness (and against exact matching), to achieve one identity per person, accepting a
migration of the existing rows.

Context: <the forces, described neutrally>
Options considered: <A, B: one line of pros and cons each>
Consequences: <good, bad, neutral>
Confirmation: scenario "Registering twice with different casing is refused"; invariant M7
Confidence: medium. Revisit when: <the change that would reopen it>
```

**Confirmation is what keeps a decision true.** It ties the decision to a scenario, a test or an
invariant, so that code drifting away from the decision fails a check instead of going unnoticed.
`/gyos:doctor` checks that every Confirmation names something that exists.

**An entry is never edited after acceptance.** A change of mind is a new entry that supersedes the
old one, and the old one gets its "superseded by" filled in. That is the only edit allowed.

---

## Confronting a request with past decisions

`/gyos:feature`, and every domain skill's `workflow.md`, runs this check before writing code:

1. **Find the decisions the request touches.** Search the context's decisions log and
   `docs/decisions/` for the glossary terms, the invariants and the files the request involves.
2. **Compare.** Does the request contradict a decision, reopen one of its revisit triggers, or
   fall outside every decision on record?
3. **On conflict, stop.** Name the decision, with its file and line, and ask. The person who owns
   the product decides: keep the decision and change the request, or supersede the decision with a
   new, dated entry.
4. **On new ground, record.** A choice made during the work is written down in the same turn.
   Deferred work goes in `development/todo.md`, also in the same turn, never reconstructed later.

---

## Keeping the record alive

- **Supersede, don't edit** (Nygard, Fowler).
- **Link to Confirmation**, so drift fails a test (MADR).
- **Record revisit triggers** (Fowler).
- **Check it like code.** Docs-as-code means Git, plain text, review, automated checks, and the
  option to block a merge that lacks its docs
  ([Write the Docs: docs as code](https://www.writethedocs.org/guide/docs-as-code/)). OpenAI's
  harness-engineering team runs linters on documentation freshness and cross-links, plus a
  recurring agent that opens fix-up PRs
  ([Harness engineering](https://openai.com/index/harness-engineering/)). `/gyos:doctor` is GYOS's
  version.

---

## Laying knowledge out for agents

**What fails.** OpenAI's harness-engineering team found that a single large `AGENTS.md` fails in
four ways:
- it crowds out the task;
- everything in it becomes "important";
- it rots;
- nothing in it can be verified.

What worked was a short `AGENTS.md`, around 100 lines, that serves as a **map**, with `docs/` as
the system of record. "Anything it can't access in-context… effectively doesn't exist."
([Harness engineering](https://openai.com/index/harness-engineering/))

**`AGENTS.md`.**
- **What it is:** a plain-Markdown README for agents, with no required fields. Since December 2025
  it has been stewarded by the Linux Foundation's Agentic AI Foundation.
- **Who reads it:** Codex, Cursor, Copilot's coding agent, VS Code, Zed, Jules, Devin, Windsurf,
  Gemini CLI and others.
- **Suggested contents:** an overview, build and test commands, code style, testing instructions,
  security notes.
- **Nesting:** a package can have its own file; the nearest file wins, and the user's prompt
  overrides all of them.

([agents.md](https://agents.md/))

**[version] Claude Code (v2.1.277 or later)** reads `AGENTS.md` natively, but only when there is no
`CLAUDE.md` or `CLAUDE.local.md`. It recommends keeping each `CLAUDE.md` under 200 lines, and
moving procedures and area-specific material into skills or path-scoped rules
([Claude Code memory](https://code.claude.com/docs/en/memory)). **GYOS writes a one-line
`CLAUDE.md`, `@AGENTS.md`,** so every session loads the same map, whatever its version.

**[version] Codex** concatenates `AGENTS.md` files from the repo root down to the working
directory, with a combined cap of 32 KiB by default
([Codex AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)).

**Progressive disclosure in skills.**
- **What loads when:** only a skill's name and description are preloaded. `SKILL.md` loads when it
  is relevant, and reference files load on demand.
- **Size:** keep the `SKILL.md` body under 500 lines, keep references one level deep, and give any
  file over 100 lines a table of contents.
- **Content:** assume the model already knows general things.

([Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices),
[Claude Code skills](https://code.claude.com/docs/en/skills))

**Context engineering, in one line:** aim for "the smallest possible set of high-signal tokens",
retrieved just in time through file paths, with persistent notes for what must survive a session
([Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

**What this means for a GYOS domain skill.**
- **`SKILL.md` is a map:** the context's purpose, a summary of its invariants, and links to the
  glossary, the `.feature` files, the decisions and the known defects.
- **The glossary is always loaded.**
- **Everything else is loaded when the situation needs it.**

**Gap.** No authoritative source covers glossaries written specifically for agents. GYOS's
position rests on BRIEF's "business language" principle, on the repo-as-system-of-record argument
above, and on KDP's own production experience (see `knowledge-driven-programming.md`).
