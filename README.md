# GYOS — Grow Your Own Software

**Knowledge-Driven Development with Claude Code.**

GYOS is a set of Claude Code skills that takes you from a product idea to a
well-architected codebase, without the slop.

> **Status: early design.** There is nothing to install yet. This README
> describes what GYOS is meant to do while the skills are being written.

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

Each bounded context becomes a **module**:

- It has **one public entry point**. Callers never reach into its internals.
- It is **layered inside**: entities → repositories → services → handlers.
- It **owns its data**. Other modules can use that data only through the
  module's entry point.
- Its **dependencies point one way**, with no cycles.

These rules aren't advice in a document. They are architecture tests that fail
the build, so an agent or a person who breaks one finds out immediately.

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
  docs/
    context-map.md        # the bounded contexts and how they relate
  modules/
    billing/              # one bounded context, one module
    scheduling/
  apps/                   # thin applications that compose the modules
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

- **Knowledge-Driven Development (KDD).** A way of building software in which
  the domain knowledge (language, rules, decisions) is made explicit before the
  code and kept up to date alongside it, so that people and agents work from
  the same source.
- **Bounded context.** A part of the product with its own consistent language
  and rules. "Invoice" means one thing inside billing, and it may mean
  something else outside it.
- **Context map.** The list of bounded contexts and the relationships between
  them.
- **Module.** The code of one bounded context, with one public entry point and
  enforced boundaries.
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
