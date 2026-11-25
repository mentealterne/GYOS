# Standard: domain skill

The shape of every domain skill GYOS generates, and the rules each one follows. `/gyos:init` and
`/gyos:context` generate skills to this standard, and `/gyos:doctor` checks them against it.

**Version: `domain-skill/1`.** Every generated `SKILL.md` records it in its frontmatter.

The standard is taken from the one behind Knowledge-Driven Programming in production (see
`knowledge/knowledge-driven-programming.md`), adapted to skills that GYOS generates for a new
product. The reasons for its rules on decisions and context loading are in
`knowledge/decision-records.md`.

---

## Contents

1. [What a domain skill is](#what-a-domain-skill-is)
2. [Where it lives, and what it may point at](#where-it-lives-and-what-it-may-point-at)
3. [The shape](#the-shape)
4. [Where each kind of knowledge goes](#where-each-kind-of-knowledge-goes)
5. [Size ceilings](#size-ceilings)
6. [SKILL.md](#skillmd)
7. [glossary.md](#glossarymd)
8. [architecture.md](#architecturemd)
9. [workflow.md](#workflowmd)
10. [testing.md](#testingmd)
11. [scenarios.md](#scenariosmd)
12. [state-of-the-code.md](#state-of-the-codemd)
13. [guardrails.md](#guardrailsmd)
14. [development/](#development)
15. [How GYOS fills a new skill](#how-gyos-fills-a-new-skill)
16. [Conformance checklist](#conformance-checklist)
17. [Changing this standard](#changing-this-standard)

---

## What a domain skill is

A domain skill is the agent that owns **one bounded context**, and one module. It holds that
context's:

- language and terminology;
- business rules;
- product promises, in plain language;
- known broken elements and edge cases;
- end-to-end workflows.

It activates whenever the conversation turns to its context, not only when someone calls it by
name.

**The test that separates a domain skill from a utility:** would it still have something to say
if nobody asked it anything? A domain skill would: a vocabulary, a contract, a history of
decisions. A skill that only performs an action on request is a utility. A utility is a single
`SKILL.md` and is not held to this standard.

---

## Where it lives, and what it may point at

- **Location:** `.claude/skills/<context>/` in the user's repo, committed, so every teammate gets
  it with `git pull`. Claude Code loads project skills automatically.
- **Name:** the context's kebab-case name, the same as its module (`billing` →
  `modules/billing`, `@module/billing`). GYOS refuses a context name that would collide with a
  built-in Claude Code command or with one of GYOS's own skills.
- **Self-contained.** A generated skill cannot use `${CLAUDE_PLUGIN_ROOT}`: that variable is only
  substituted in the plugin's own skills. It points only at files inside the user's repo:

| It may point at | Copied there by |
| --- | --- |
| `docs/standards/module.md` | `/gyos:init`, from `standards/module.md`, with its version |
| `docs/standards/domain-skill.md` | `/gyos:init`, from this file |
| `docs/context-map.md` | `/gyos:discover` |
| `docs/decisions/` | `/gyos:init`, `/gyos:decide` |
| `modules/<context>/` | `/gyos:init`, `/gyos:context` |

---

## The shape

```
.claude/skills/<context>/
  SKILL.md               core: identity, activation, load plan. Thin
  glossary.md            core: the ubiquitous language of the context
  architecture.md        core: the context's invariants, how to navigate its module
  workflow.md            core: the operating protocol
  testing.md             always, in GYOS: every module has a test suite
  scenarios.md           when the context has behaviour a non-developer can observe
  state-of-the-code.md   when earned: known defects, deliberate oddities
  guardrails.md          when earned: prohibitions beyond the repo-wide ones
  development/
    decisions.md         dated decisions: an Active table above an append-only log
    todo.md              deferred work, and what would make it urgent
    qa-checklist.md      the handoff artifact, by role
  references/            depth, loaded on demand
```

**Four core files, always.** Without them a domain skill is not one: identity, language,
contract, protocol.

**In GYOS, `testing.md` is always present too,** because every module ships unit, architecture,
scenario and integration tests (`docs/standards/module.md`). A suite the skill never mentions is
a convention the agent can't follow.

**The other three files are created when the context has something to put in them,** and
omitted until then:
- `scenarios.md`;
- `state-of-the-code.md`;
- `guardrails.md`.

A file holding one apologetic line is ceremony; its absence says the same thing more honestly.

**Optional files are created during work, not only at generation.** When work surfaces content
for an optional file the skill doesn't have yet, the skill creates that file in the same turn
and in the same change, and says so in chat:

| Work surfaces… | Creates |
| --- | --- |
| A bug that is known or deliberate | `state-of-the-code.md` |
| A command, repo or dataset that is off-limits | `guardrails.md` |
| A behaviour guarantee that ops or QA must be able to read | `scenarios.md` |

---

## Where each kind of knowledge goes

| Kind of knowledge | Goes to | Because |
| --- | --- | --- |
| A term that means something specific here | `glossary.md` | It is language, not a rule |
| An invariant that must never break | `architecture.md` | It is a stable contract |
| How to find where existing behaviour lives | `architecture.md` | A method doesn't go stale the way a path table does |
| A known defect, or behaviour that looks wrong but is deliberate | `state-of-the-code.md` | It is the code's condition today, not the contract |
| A dated decision, its reason and what it supersedes | `development/decisions.md` | It is state, and it accumulates |
| A decision that spans contexts (a junction, a default) | `docs/decisions/` | It belongs to no single context |
| An observable behaviour the context guarantees | `scenarios.md` and the `.feature` files | It is behaviour, not implementation |
| A test convention, a tier, what counts as a regression | `testing.md` | It is method |
| A rule the agent follows every time, at a point in the sequence | `workflow.md` | It is protocol |
| An absolute prohibition | `guardrails.md` | It applies at every step |
| An open question from discovery | `docs/context-map.md`, the context's Open questions | It is shared with the people who can answer it |
| Depth on any of the above | `references/` | It is loaded only when a task needs it |

**Decisions never go in `architecture.md`.** That file is a contract, short enough to read whole
before writing code. Decisions accumulate one per session, forever; mixed into the contract,
they make it unreadable within months.

---

## Size ceilings

A threshold says when a file earns its place. A ceiling says when it has outgrown it. Without
ceilings nothing is ever pruned: every other rule says *write*.

| File | Ceiling | At the ceiling |
| --- | --- | --- |
| `SKILL.md` | ~150 lines | It has picked up domain knowledge: move it to the file that owns it |
| `glossary.md`, `architecture.md`, `workflow.md` | ~200 lines | Depth has leaked into a contract: move it to `references/` |
| `testing.md`, `scenarios.md`, `state-of-the-code.md`, `guardrails.md` | ~250 lines | Split by concern, or move detail to `references/` |
| `development/decisions.md` | ~150 lines | Archive superseded entries (see [development/](#development)) |
| `development/todo.md` | ~150 lines | Delete entries that are done or no longer true |
| `development/qa-checklist.md` | ~400 lines | Split by concern within its organization by role |
| `references/*` | none | Not in the load plan; length costs nothing until something loads it |

These are ceilings, not targets: a 60-line `architecture.md` that states the invariants is
finished. The numbers are approximate. What matters is that "this file is too long" is a check
someone performs, and `/gyos:doctor` performs it.

**Pruning is part of the write.** When the skill writes to a file that is over its ceiling,
bringing it back under is part of the same write: not a follow-up, not a todo entry. Prune only
the file being written, and say so in one line.

---

## SKILL.md

The entry point. **Thin:** identity, activation, the load plan, a quick reference. It carries no
domain knowledge of its own.

### Frontmatter

```yaml
---
name: billing
description: >
  Owns the billing context of <product>: invoices, payment terms, credit notes, dunning.
  Use it whenever work or a question touches billing, even without naming it: "why was
  this invoice issued twice?", "add a late fee", "what does 'settled' mean?". Vocabulary:
  invoice, credit note, payment term, dunning, settled. Not for payments processing
  (payments) or pricing (catalog).
metadata:
  gyos-standard: domain-skill/1
  module: "@module/billing"
---
```

**The `description` is what Claude matches on.** It names:
1. the **context** and what it owns;
2. the **question shapes** that should wake it;
3. the **vocabulary**, so other skills can tell whose a word is without opening a file;
4. the **boundaries**: what is not this context's, and whose it is.

Put the key use first. Together with `when_to_use`, the listing is cut at 1,536 characters.

### Activation: by name and by domain

**Both paths are mandatory.** A skill that answers only to its name sleeps exactly when it is
most needed: when someone asks about its context without knowing a specialist exists.

1. **By name:** `/billing`, or "billing skill".
2. **By domain:** automatically, whenever the conversation turns to the context. State it as
   signals an agent can check:

| Signal | Form |
| --- | --- |
| **Paths** | `modules/billing/**`, the frontend folder for billing, its `.feature` files |
| **Vocabulary** | Terms from `glossary.md` appearing in the request. The glossary doubles as the detector |
| **Questions** | Recognizable question shapes, as examples |

**Boundaries in both directions.** Say what doesn't wake the skill, especially where two contexts
share a word. Where a request genuinely spans two contexts, say so, name the other skill, and
follow the cross-domain rule in `workflow.md`.

**Activation is not ceremony.** Waking means loading the context and applying its rules. It does
not mean announcing itself or turning a one-line answer into a procedure.

### The load plan

A domain skill exists to stop an agent reading a whole module to answer one question. It does
that only if it says which of its files to open:

- **Always:** `glossary.md`. It is how the request gets read.
- **Inquiry:** the glossary, plus what the question needs. Often that is one file; "is this a
  bug?" needs `scenarios.md` and `state-of-the-code.md`.
- **Change:** `architecture.md`, `workflow.md`, `testing.md`, `development/decisions.md` (the
  Active table only).
- **On arrival:** everything else, when the task reaches what it covers.
- **The module's code and `docs/`:** only when the skill's own files don't answer.

Each track carries an approximate token cost. `/gyos:doctor` measures it (characters ÷ 4) and
updates the numbers. A number makes "load only what you need" concrete.

### Body

1. **Identity.** One paragraph: what this skill owns, and what it doesn't.
2. **Activation.** Both paths and the signal table.
3. **Tracks.** Inquiry and Change, with the routing test (see `workflow.md`).
4. **Load plan.** As above, with token costs.
5. **Quick reference.** The module's key paths, and `references/` with a "load when" column.

---

## glossary.md

The **ubiquitous language of the context**: what these words mean *here*, especially where that
differs from ordinary usage or from a neighbouring context. It is the file that prevents the
quietest damage: an agent writing `slot` where the context says `availability`, and the codebase
drifting one identifier at a time.

### Contents

- **Core terms**, as a table:

  | Term (business language) | In code | Meaning here | Codified in | Banned synonyms |
  | --- | --- | --- | --- | --- |

  - The first column keeps the business term in the language the business uses (an Italian
    product keeps "fattura").
  - The second column is the identifier in code, as recorded in the ADR on language that
    `/gyos:init` writes.
  - A term that exists in code points at where: a type, a table, a vocabulary constant.
- **Distinctions that matter:** pairs that are often confused, and what goes wrong when they are.
- **Terms that mean something else elsewhere:** the same word in another context, with the skill
  that owns that meaning. This is one of the two places a skill may name a neighbour.
- **Names not to use:** wrong or retired terms, and what to say instead.

**Threshold:** at least one term that someone who knows the product couldn't guess from ordinary
English. A glossary of obvious terms is noise.

---

## architecture.md

The **contract** for this context: what must always hold here. It is stable by construction. If
it changes more than a few times a year, decisions have leaked into it.

### Contents

- **The module standard applies.** One line pointing at `docs/standards/module.md`, never a copy
  of it. Two copies of an architecture diverge.
- **Context invariants:** numbered `C1`, `C2`, …, one line each, each with the rule and **the
  trap it avoids**. A rule without its trap gets rationalized away under deadline pressure. These
  are the business invariants discovery found ("an invoice, once issued, never changes amount"),
  not the module rules, which the standard already states.
- **Classification and depth:** core, supporting or generic, and therefore how rich the domain
  model is. A supporting context with a near-empty `domain/` is correct, not unfinished.
- **The areas** of the module, and what each owns.
- **Published language:** the controllers' operations, `contracts.ts`, the vocabulary subpaths,
  and any published views. This is what other contexts may rely on.
- **Required ports:** what the module needs from outside. Where a port is implemented by calling
  another module, name the junction and point at its entry in `docs/context-map.md`.
- **How to navigate:**
  - **The trace:** the call path from the outside in, as a chain of file kinds, with one
    **verified** worked example. For example: route in `apps/api` →
    `billingController.issueInvoice` → `invoices/services/issue-invoice.ts` → `InvoiceRepository`
    → `invoices/adapters/invoice-repository.postgres.ts`.
  - **Naming as address:** where file names encode the vocabulary, knowing the term is knowing
    the file.

**Threshold:** at least one context invariant whose violation would be a real defect, not a style
preference.

---

## workflow.md

The **operating protocol**: what the agent does, in order, every time. It is the part that most
often decides whether a skill is followed or quietly ignored.

### Routing first: Inquiry or Change

**The test:** will the working tree be different when the work is done?

| | Inquiry | Change |
| --- | --- | --- |
| The request | Asks for an answer | Asks to modify something |
| Produces | An answer that cites the file and line it comes from | Code, tests, updated knowledge, a handoff |

A bug fix is a Change. An Inquiry becomes a Change the moment the user asks for the fix. Switch
tracks then, from the first step; don't drift into implementing because the fix looks small.

**The Inquiry track comes first in the file,** with a marker where an Inquiry can stop reading.
A track at the bottom of a long file gets read in full every time, which defeats the load plan.

### The five mandatory rules

They apply in both tracks. A generated skill that omits one does not conform.

**1. Clarify before loading.** Check that the request is unambiguous on the dimensions this
context needs (each skill names its own: which tenant, which role, which document state). If one
is missing, or the owner of the behaviour is unclear, stop and ask. Don't infer silently.

**2. Confront before changing.** Before implementing anything that would alter, remove or
contradict a documented behaviour or a recorded decision:
1. stop;
2. name the conflict, citing the file and line: the scenario, the invariant, or the decision;
3. ask whether the change is intended;
4. proceed only after explicit confirmation;
5. update the affected documents in the same change. A decision that changes gets a new entry
   that supersedes the old one.

Check `scenarios.md` and the Active table in `development/decisions.md` first, so this is
mechanical rather than a matter of remembering. A request that changes documented behaviour is
not refused; it is surfaced, confirmed, and the documentation follows. Silence is the failure, in
either direction.

**3. Pin before refactoring.** Documented behaviour is captured by a scenario or a test *before*
any refactoring that could change it. If the behaviour isn't pinned yet, pinning it is the first
step of the refactoring.

**4. Defer in writing, in the same turn.** Anything postponed (a feature cut from scope, a fix
punted, a gap found but not closed, a concern raised and set aside) goes into
`development/todo.md` immediately: what, why, and what would make it urgent. Never at the end of
the session, and never from memory.

**5. Every invocation ends with a `development/` write.** The file update is the deliverable;
pasting the same content into chat doesn't count. State in chat which file was written. Which
file depends on what happened:

| | Writes to |
| --- | --- |
| **Change** with a product surface | `qa-checklist.md`, plus any decision or todo |
| **Change** without one | A decision, a todo, or a `state-of-the-code.md` entry |
| **Inquiry** | Whatever the answer produced: a defect found, work identified but not done, a decision settled |

If an invocation genuinely produced nothing worth recording, say so explicitly. A silent
omission and a deliberate one look the same afterwards.

### The Change protocol

```
0  Clarify          rule 1
1  Load             the Change set from the load plan
2  Confront         rule 2: scenarios, the Active decisions, the invariants
3  Gap analysis     what exists, what is missing, what the change touches; reported before code
4  Example mapping  the rules and examples of the change; open questions go to the user, not into code
5  Scenario first   a failing scenario (BDD + TDD), or a failing test (TDD only)
6  Implement        the module standard's layer chain, test first in the inner loop
7  Verify           every tier in testing.md; real results, not claims
8  Update knowledge glossary, invariants, scenarios, state-of-the-code, made stale by the change
9  Record           rule 5, last
```

Steps 4 and 5 follow the testing style recorded at setup. With the pragmatic style, step 5 is
"tests are written", in any order.

### Crossing into another context

Contexts sit side by side and share words. The rule for crossing is narrow on purpose: **a skill
that loads other skills freely undoes the reason domain skills exist.** Stop at the first step
that answers:

| Step | Situation | Do |
| --- | --- | --- |
| 1 | The boundary is already in your `glossary.md` | Answer, and name the other context |
| 2 | You need the other context's vocabulary | Load **only its `glossary.md`**, and say so |
| 3 | You need more than its vocabulary, and a skill owns it | **Switch to that skill** and carry on under its rules. Say so in one line. Come back for your own half |
| 3b | No skill owns it | Work with the ordinary tools, say you are outside the context, and keep this context's invariants on your side |

**The exception:** when you are about to change something another context consumes (an
operation, a contract type, a published view, an event), also load its `scenarios.md` and apply
**its** confront rule.

**The junction belongs to neither context.** When work spans two contexts, each skill applies its
own rules to its own half, and the contract between them is owned by neither. That is where the
expensive bugs live. Name the junction, say it belongs to neither, and settle its owner before
implementing. The default owner is the host's composition root. Record the junction once, in
`docs/context-map.md`, and the decision in `docs/decisions/`.

**A skill never lists its neighbours in `workflow.md`.** That list would go stale the day a
context is added. Neighbours are named only in `glossary.md`, for shared terms, and in
`SKILL.md`, for the activation boundary.

### Also in workflow.md

- **Context-specific gates:** conditions before implementing, such as a design reference before
  building new UI.
- **Standing risks to raise unprompted:** what is easy to get wrong in this context.
- **The optional-file rule,** restated here, where it will actually be read.

---

## testing.md

**How this context proves that something works**, as actually practised in its module.

- **The tiers:** unit, architecture, scenarios and integration, as the module standard defines
  them. Name the module's real directories and commands, for example
  `pnpm --filter @module/billing test:scenarios`.
- **What must be tested before a change is done.**
- **What counts as a regression,** never acceptable to make a suite pass:
  - weakening an assertion;
  - `.skip`;
  - widening a matcher;
  - raising a timeout to hide a race;
  - deleting a scenario.
- **Legitimate reasons a test may change,** so that "the test changed" can always be classified.
  Anything that can't be classified is a finding to report.
- **Where coverage is thin,** so absence of tests isn't mistaken for absence of risk.

---

## scenarios.md

**What the context promises, readable by someone who doesn't read code:** ops, QA, a product
manager.

- **The hard rule:** no file names, function names, layer names or type names. A scenario that
  can't be stated without them is a test, and belongs in `testing.md`.
- **An index of the `.feature` files.** They already are behaviour language, so `scenarios.md`
  doesn't repeat them. It gives each one a single sentence: the promise it holds.
- **Who does what:** every promise names the role that acts.
- **Configuration that gates the behaviour:** a promise that holds only under some configuration
  says which.
- **Out of scope and known gaps,** so a reader doesn't report a false failure.

With the "TDD only" testing style there are no `.feature` files. The promises are then written
here directly, as Given/When/Then with real values.

**Threshold:** at least one promise a non-technical reader could check without asking a
developer.

---

## state-of-the-code.md

**The condition of the code today,** as opposed to the contract. It prevents two opposite,
equally expensive mistakes: faithfully reproducing a defect because it looked like a requirement,
and silently "fixing" something deliberate because it looked like a defect.

- **Known defects:** what, where, severity, and **what to do**: fix it in any task that touches
  it, or leave it and route around it. An entry without an instruction invites the same argument
  again.
- **Deliberate oddities:** behaviour that looks wrong and isn't, with the reason.
- **What is done right, so don't "improve" it:** code that has survived scrutiny.
- **Known debt,** with the condition that would make it urgent.

**The rule that makes it work: before reproducing an existing behaviour, check this file.**

---

## guardrails.md

**Absolute prohibitions specific to this context's blast radius.** They are kept apart from
`workflow.md` because a prohibition has no position in a sequence: it applies at every step.

- **Commands never to run,** such as live payment providers or production data.
- **Surfaces never to write without explicit confirmation.**
- **Data never to read, print or summarize:** name the context's own instances, not just the
  category.
- **Actions that need confirmation every time.**

State each one as an unconditional sentence, with its consequence. Rules that apply repo-wide
live in `AGENTS.md` and are not repeated here.

---

## development/

**State,** next to the knowledge. It changes every session.

### decisions.md

An **Active table** above an **append-only log**:

```markdown
# Decisions: billing

## Active

| Date | Decision |
| --- | --- |
| 2026-11-25 | An issued invoice never changes amount; corrections are credit notes |

---

## Log

### 2026-11-25: Issued invoices are immutable

Status: accepted · supersedes: — · superseded by: —

In the context of invoicing, facing corrections after issue, we decided for credit notes (and
against editing the invoice), to achieve an audit trail the accountant can trust, accepting one
more document type.

Confirmation: scenario "A correction after issue produces a credit note"; invariant C2
Confidence: high. Revisit when: a jurisdiction allows amended invoices
```

- **The Active table** holds one line per decision that still holds. It is the only part of the
  file that gets edited: when an entry is superseded, its row is removed. A reader asking what
  holds stops at the table; a reader asking why reads the log.
- **Log entries** follow `docs/decisions/README.md`, which `/gyos:init` copies from
  `knowledge/decision-records.md`. A context-level entry needs at least the Y-statement,
  Confirmation, and supersedes. An entry that weighed real alternatives gets its own ADR in
  `docs/decisions/`, and the log links to it.
- **Confirmation** ties a decision to a scenario, a test or an invariant, so that drift fails a
  check. `/gyos:doctor` checks that every Confirmation names something that exists.
- **Archiving:** at the ceiling, log entries that are superseded *and* older than about six
  months move to `decisions-archive.md`, which is never in the load plan. Age alone is not a
  reason: an old decision that still holds is load-bearing.

### todo.md

Deliberately deferred work. Each entry says what was deferred, why, and what would make it
urgent. It is not a backlog: only what this context's agent chose not to do, with enough context
for the next session to pick it up.

### qa-checklist.md

The handoff artifact: what someone else should now check, **organized by role** (the people who
use the product), not by story. Items are `- [ ]` checkboxes. It references scenarios instead of
copying them.

---

## How GYOS fills a new skill

**Never invent.** Every term, invariant, scenario and decision traces back to an answer the user
gave or confirmed, to code, or to a document. What came out of discovery labelled *inferred* or
*speculative* goes in only after the user confirms it. Otherwise it stays an open question in
`docs/context-map.md`.

| File | Filled from |
| --- | --- |
| `SKILL.md` | The context's purpose, its vocabulary and its boundaries (Bounded Context Canvas) |
| `glossary.md` | The discovery glossary for this context, with the code names recorded in the language ADR |
| `architecture.md` | The context's invariants and classification from discovery; the module's areas, ports and published language from scaffolding |
| `workflow.md` | This standard's protocol, specialized with the context's clarify dimensions, the testing style, and its standing risks |
| `testing.md` | The module's real test commands and tiers |
| `scenarios.md` | The examples from discovery, as an index of the generated `.feature` files |
| `development/decisions.md` | The setup decisions that concern this context; empty otherwise, with its Active table |
| `development/todo.md` | Created empty; filled during work |

The trace in `architecture.md` is verified once the walking skeleton exists. Until then it is
marked "unverified: confirm against the code before relying on it".

---

## Conformance checklist

`/gyos:doctor` checks every item. A skill conforms when:

- [ ] `SKILL.md` records `gyos-standard: domain-skill/1`, and is thin: identity, activation, load plan, quick reference.
- [ ] The core files exist (`SKILL.md`, `glossary.md`, `architecture.md`, `workflow.md`), and so does `testing.md`.
- [ ] Each optional file either has real content or is absent: no stubs.
- [ ] The `description` names the context, the question shapes, the vocabulary and the boundaries, with the key use first, within 1,536 characters together with `when_to_use`.
- [ ] Activation by domain is stated as checkable signals: paths, glossary vocabulary, question shapes.
- [ ] The load plan has the always-loaded glossary, a set per track, and token costs.
- [ ] `glossary.md` has at least one non-obvious term; every term that exists in code points at where.
- [ ] `architecture.md` points at `docs/standards/module.md` instead of copying it, states context invariants with their traps, and gives a navigation method with a worked example (verified once code exists).
- [ ] `workflow.md` routes Inquiry or Change first, puts Inquiry before Change, carries the five mandatory rules and the cross-domain rule, and lists no neighbours.
- [ ] `scenarios.md`, if present, names no files, functions or types.
- [ ] `development/decisions.md` has an Active table with no superseded rows, and every Confirmation names something that exists.
- [ ] No file is far past its ceiling.
- [ ] No dated decisions in `architecture.md`.
- [ ] No reference to `${CLAUDE_PLUGIN_ROOT}`; every link resolves inside the repo.
- [ ] Every claim traces to the user, code or a document; anything unverified says so.

---

## Changing this standard

Changing this file changes every skill generated afterwards. So:

1. Record the change in `docs/plan.md`'s decisions, with its reason, and bump the version
   (`domain-skill/2`).
2. Update the templates and the skills that generate or check domain skills in the same change.
3. Say whether existing skills must be migrated (`/gyos:upgrade`) or may stay as they are.
   Divergence is fine when recorded, and corrosive when accidental.
