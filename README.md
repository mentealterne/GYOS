# GYOS — Grow Your Own Software

**Knowledge-Driven Programming with Claude Code.**

GYOS is a set of Claude Code skills that takes you from a product idea to a
well-architected codebase, without the slop.

> **Status: early.** The first skill, `/gyos:discover`, is in. The others
> (`init`, `context`, `feature`, `decide`, `doctor`) are being written; see
> [the plan](docs/plan.md).

## Install

In Claude Code 2.1.275 or later:

```
/plugin install gyos --marketplace mentealterne/GYOS
```

Or in two steps: `/plugin marketplace add mentealterne/GYOS`, then
`/plugin install gyos@gyos`. Then describe your product idea and run
`/gyos:discover`.

## Why

Coding agents are fast. Left alone, they also forget everything between
sessions and ignore boundaries:

- **No shared language.** The same concept ends up with three names in three
  files, and sometimes three meanings.
- **No boundaries.** Every feature reaches into every other feature's tables
  and internals, because nothing says it can't.
- **No memory.** Each session starts from zero. A decision made last week gets
  undone this week, because nobody wrote down why it was made.

The usual fix is more prompting. GYOS fixes it with structure. The knowledge an
agent needs to work well in a domain is written down once, next to the code,
and loaded automatically whenever the work touches that domain.

There are two ways for code to be right. It can **work**: it runs and the tests
pass, and when it doesn't, the machine tells you. And it can be **true**: it does
what the business actually decided. Only the people who own the product can
check that, and an agent that gets it wrong is confidently wrong. GYOS records
those decisions where the agent reads them, and checks every new request
against them before writing code.

## How it works

GYOS works in four stages: **Discover → Shape → Embody → Grow**.

### 1. Discover

You start from a product prompt: a paragraph, a pitch, or a messy list of
features. GYOS doesn't start generating code. It starts asking questions,
Socratic-style:

- Who uses this, and what do they call things?
- What happens when something goes wrong?
- What must never happen?

From your answers it draws a **context map**: the bounded contexts of your
product, the language each one speaks, and how they depend on each other.

Nothing goes into the model unless it came from you. When GYOS doesn't know
something, it asks. When you aren't sure, it records an open question instead
of guessing.

### 2. Shape

Your product becomes a **modular monolith**: one deployable app, and one module
per bounded context. Each module:

- has **one factory** that builds it from an injected configuration (database
  pool, logger, clock, outside services), so nothing is a hidden singleton;
- is **ports and adapters** inside: pure rules in the middle, use cases around
  them, and every database query or outside call behind an interface;
- **owns its own Postgres schema** and migrates it, and never joins another
  module's tables;
- **depends on other modules one way**, through their public entry points, with
  no cycles.

These rules aren't advice in a document. They are architecture tests that fail
the build, so an agent or a person who breaks one finds out immediately. The
full shape is in [`standards/module.md`](standards/module.md).

### 3. Embody

Each module gets its own **domain skill**: a Claude Code skill scoped to that
one bounded context. It activates whenever the conversation turns to its
domain, and it carries what an expert in that domain would know:

| File                   | What it holds                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| `SKILL.md`             | Identity, when to activate, an index of everything below         |
| `glossary.md`          | The ubiquitous language of the context                           |
| `architecture.md`      | Invariants, the layers, how to find your way around the module   |
| `workflow.md`          | How to work here: when to ask, when to defer, when to hand off   |
| `guardrails.md`        | What must never be done in this domain                           |
| `testing.md`           | How this domain proves that something works                      |
| `scenarios.md`         | Expected behaviour, in words a non-developer can check           |
| `state-of-the-code.md` | Known defects and deliberate oddities: what not to "fix"         |
| `development/`         | Dated decisions, deferred work, handoffs                         |

The first four files are always there. The others appear only when the domain
has something to put in them, because an empty file is ceremony.

### 4. Grow

The skills aren't written once and forgotten. As you build, they record:

- **decisions**, dated, along with which earlier decisions they replace
- **deferred work**, and what would make it urgent
- **quirks** that would otherwise surprise the next person

The next session, whether it's yours, a teammate's or an agent's, starts where
the last one stopped.

## What you end up with

```
your-product/
  AGENTS.md               # the stack, the commands, the rules, the contexts
  docs/
    context-map.md        # the bounded contexts, how they relate, the junctions
    decisions/            # why things are the way they are, dated
  apps/
    api/                  # the one deployable: composes the modules
    web/                  # React, Svelte or Vue
  modules/
    billing/              # one bounded context, one module, one schema
    scheduling/
  .claude/skills/
    billing/              # the domain skill for modules/billing
      SKILL.md
      glossary.md
      architecture.md
      workflow.md
      development/
    scheduling/
```

## Principles

- **Knowledge first, code second.** You can't build a domain well if you can't
  name what's in it.
- **Ask, never invent.** Every term, rule and scenario can be traced to you,
  your documents or your code. Anything unverified is marked as unverified.
- **One bounded context, one module, one skill.**
- **Boundaries are tests, not intentions.**
- **Knowledge lives next to the code** and changes with it, in the same commit.
- **No ceremony without content.** A skill that only performs an action stays a
  single file.

## Vocabulary

- **Knowledge-Driven Programming (KDP).** The formalization of the decisions a
  piece of software is made of. They are never final and they keep
  accumulating, so that an agent builds knowing not only what the code does,
  but why it was decided that way.
- **Bounded context.** A part of the product with its own consistent language
  and rules. "Session" can mean a booked meeting in a calendar context and a
  person answering a questionnaire in an assessments context.
- **Context map.** The list of bounded contexts and the relationships between
  them.
- **Junction.** A rule that spans two contexts ("when an assessment is
  complete, book a meeting to hand over the results"). It belongs to neither
  context, so it is named and given an owner exactly once.
- **Modular monolith.** One deployable application split into modules with
  enforced boundaries, instead of many services talking over the network.
- **Module.** The code of one bounded context: one factory, ports and adapters
  inside, its own database schema.
- **Ports and adapters.** A port is an interface describing what the domain
  needs from the outside (storage, email, a clock). An adapter is one way of
  providing it. Swapping an adapter never touches the rules.
- **Domain skill.** A Claude Code skill that carries the knowledge of one
  bounded context and activates when work touches it.

## Where it comes from

GYOS packages a way of working that was first developed by hand on a
production codebase: domain modules with enforced boundaries, and one Claude
Code skill per domain carrying that domain's knowledge. GYOS automates the
setup, so a new product can start that way from its first commit.

## License

Copyright 2026 Alfredo Guida. Licensed under the [Apache License 2.0](LICENSE).

**Files GYOS generates in your project are yours.** This license covers GYOS
itself. You can use, change and relicense anything it writes into your
repository, without keeping this notice or crediting GYOS.
