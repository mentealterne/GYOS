# Knowledge-Driven Programming

The framework GYOS implements. Every GYOS skill loads this file first: it says why the rest
exists.

---

## The definition

> Knowledge-Driven Programming is the formalization of the decisions a piece of software is made
> of, never final, always accumulating, so that an agent builds knowing not only what the code
> does, but why it was decided that way.

## The problem it solves

An AI assistant writes in minutes what used to take a day, but it loses its context window, so
every session starts from scratch. A team loses something similar: the thread of what changed and
why. The cost is usually discovered when something breaks.

The result is systems that move quickly and remember nothing.

## Works vs true

| | What it means | Who verifies it | When it is wrong |
| --- | --- | --- | --- |
| **Works** | The code runs and does what the code says | The machine: tests and runtime | It fails, loudly |
| **True** | The code does what the organization decided | People: the team that owns the product | It is confidently wrong, and nothing fails |

An agent can check that code works. It cannot check that code is true, because truth is a
decision the organization makes, and it changes over time. Knowledge verification is a shared,
human effort. The developer's job shifts: they program the team's decisions into the agent, and
prepare the agent to track how those decisions change.

## The operative loop

1. **Record decisions.** Capture the rationale, the trade-offs and the domain context behind
   every rule, not just the code that implements it.
2. **Confront and align.** Check every new request against the recorded decisions before
   building. A conflict is surfaced, never silently resolved.

Without the loop, development drifts from its original intent. With it, new code is confronted
with what was decided, and the system stays true over time.

---

## One owner per bounded context

KDP is implemented by **domain agents**: exactly one agent per bounded context. In Claude Code,
that agent is a skill. It holds the context's:

- language and terminology;
- business rules;
- product promises: what users are guaranteed, in plain language;
- known broken elements and edge cases;
- end-to-end workflows.

**Every context is a world with its own vocabulary.** A bounded context is the boundary inside
which a word has one precise meaning:

| Term | In a calendar context | In an assessments context |
| --- | --- | --- |
| session | A booked meeting | A person answering a questionnaire |
| restitution | A meeting to hand over results | The report itself |
| role | A mentor or a manager | A respondent's relation to the person assessed |

The ubiquitous language is the core of the declared form. The glossary is the one file an agent
always loads.

## The skeleton of a domain agent

It replaces free-form prose with predictable, single-purpose files.

**Always present:**

| File | Holds |
| --- | --- |
| `SKILL.md` | The agent's identity, when it activates, an index |
| `glossary.md` | The local definitions |
| `architecture.md` | The rules that must not be broken |
| `workflow.md` | How work is carried out, step by step |

**Present when the domain has something to put in them:**

| File | Holds |
| --- | --- |
| `testing.md` | How the domain proves something works |
| `scenarios.md` | The product promises, in plain language |
| `state-of-the-code.md` | Known defects and deliberate oddities |
| `guardrails.md` | Absolute prohibitions |

Plus `development/`: dated decisions (append-only), deferred work, handoffs.

An optional file is created the moment its content first appears during work, in the same
change. If it isn't written then, it never gets written.

## Junctions: the knowledge that belongs to nobody

Some rules span two contexts. "When an assessment is complete, automatically book a restitution
meeting" is neither assessments' rule nor the calendar's. Left alone, both agents will claim it,
or neither will. The protocol:

1. the interaction is **named** explicitly;
2. it is **declared to belong to neither** context;
3. its ownership is **settled and documented exactly once**.

## How a domain agent works

**Activation.** The agent wakes on its domain's context, not only when called by name. A calendar
agent wakes on words like "slot", "no-show", or "why can't this person book?".

**Routing.**
- **A question** gets an answer that cites the line it comes from, and then the agent stops.
- **A change** goes through: clarify → gap analysis → implement → verify → hand off.

**Decisions in files.**
- Settled conventions go in `decisions.md`, dated and append-only.
- Deferred work is written down in the same turn it is deferred, never reconstructed later.
- QA checklists are organized by role, not by story.

**Guarantees.**
- **The golden rule:** documented behaviour is captured before refactoring.
- **Conflicts halt execution** and name the file and line they come from.
- **The developer sees:** gap analysis before code, real automated test results, and a git log
  that reads as a history.

## Selective context loading

> Knowledge you cannot load in pieces is knowledge you will not load.

The glossary is always loaded. Every other file is declared in `SKILL.md` and loaded only when the
situation calls for it. In the production codebase where KDP was developed, a simple question
costs around 4,000 tokens and real feature work around 11,000, about 60% less for the most
frequent cases.

## Making it self-sustaining

A skill that builds skills turns KDP from a manual discipline into infrastructure:

| Job | In the original framework | In GYOS |
| --- | --- | --- |
| **Create** a domain agent through an interview | `skilldom` | `/gyos:init`, `/gyos:context` |
| **Migrate** an existing agent into the form | `skilldom` | `/gyos:adopt` (later) |
| **Check** every agent against the form | `skilldom` | `/gyos:doctor` |

The next domain gets its structure for free.

---

## What it gives the organization

1. **An explainable product.** Business logic and scenarios are written and verified in plain
   language, so the product can be explained beyond engineering.
2. **Independence from individuals.** Knowledge stops depending on key people and survives team
   changes.
3. **Preserved decisions.** Past choices are documented with their reasons, so they are not
   re-argued every quarter. The organization gets a memory.

## Why write it down

> Written, formalized knowledge is the only kind that can be objectively argued with,
> systematically corrected, and reliably passed on to others.

Knowledge that stays in people's heads can only be repeated, never scaled. Declared structures
give engineers and agents a shared, lasting foundation of truth.
