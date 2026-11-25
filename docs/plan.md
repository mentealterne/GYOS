# GYOS — the plan

What GYOS will be, how it works, and in what order it gets built. Agreed on 2026-11-25.
Anything that changes a decision below gets a dated entry in [Decisions](#decisions), not a
silent edit.

---

## What GYOS is for

GYOS turns a product idea into a clean, well-bounded TypeScript codebase, and keeps it that way
as it grows. It is for **product engineers** who need to set up an app quickly but don't want to
give up architectural guardrails to do it.

It implements **Knowledge-Driven Programming (KDP)**:

> Knowledge-Driven Programming is the formalization of the decisions a piece of software is made
> of, never final, always accumulating, so that an agent builds knowing not only what the code
> does, but why it was decided that way.

Two kinds of verification are involved, and GYOS needs both:

| | Checks | Who can do it |
| --- | --- | --- |
| **Works** | The code runs and the tests pass | The machine: tests and runtime fail on their own |
| **True** | The code matches what the business actually decided | Only the people who own the product. An agent that is wrong here is confidently wrong |

GYOS makes "true" checkable. It records decisions where the agent will read them, and before
each change it compares the new request with what was already decided.

---

## Principles

1. **GYOS is the generator; the user's repo is the product.** GYOS ships as a Claude Code
   plugin. Everything it produces lives in the user's repo and works without GYOS installed: the
   domain skills, `AGENTS.md`, the architecture tests, CI. Enforcement lives in the repo (tests,
   lint, CI), so it applies to people as well as agents.
2. **Templates where possible, the model only where needed.** Workspace config, tsconfig, lint,
   CI, the module skeleton and the architecture tests are copied from templates by scripts. The
   model writes only what needs knowledge: glossaries, scenarios, architecture notes, domain code.
3. **Modular monolith, and only that.** One deployable app and many domain modules. Each module
   is one bounded context and owns its own Postgres schema. GYOS offers no microservices option:
   boundaries are drawn and enforced inside one codebase, where moving them is cheap.
4. **Ask, never invent.** Every term, rule and scenario traces back to the user, their documents
   or their code. Only the organization decides what is true. Anything unverified is marked as
   unverified.
5. **Record, then confront.** Decisions are written down with their reasons, dated and
   append-only. Before a change, the agent checks the new request against them, and a conflict
   stops the work and names the file and line.
6. **Load knowledge in pieces.** A domain skill always loads its glossary. Every other file is
   loaded only when the situation needs it. Knowledge you cannot load in pieces is knowledge you
   will not load.

---

## Distribution

GYOS is a **Claude Code plugin**, and the repo is its own marketplace
(`.claude-plugin/marketplace.json` with the plugin at `"source": "./"`).

```
/plugin marketplace add mentealterne/GYOS
/plugin install gyos@<marketplace-name>
```

Skills are invoked as `/gyos:<skill>`. Material shared by several skills (`knowledge/`,
`templates/`, `standards/`) sits at the plugin root and is referenced as
`${CLAUDE_PLUGIN_ROOT}/...`.

The skills GYOS **generates** in a user's repo can't use `${CLAUDE_PLUGIN_ROOT}`, because
`${CLAUDE_PLUGIN_ROOT}` is only substituted in plugin skills. They must be self-contained: what
they need is copied into the repo.

---

## `/gyos:init`

One command walks through four phases. Each phase ends at a checkpoint where the user reviews
the result, and each can be re-run on its own. `init` works out where it is from the files that
already exist, not from a separate state file.

### 1. Discover

A Socratic interview, starting from the product idea.

- **One question at a time**, each with a proposed answer the user can accept, correct or
  reject. Every proposal is labelled *strong*, *inferred* or *speculative*. "I don't know" is a
  valid answer and becomes an open question; nothing is filled in by guessing.
- **Land, then explore.** GYOS asks for concrete past stories ("walk me through the last time…"),
  reaches a plausible draft of the contexts quickly and shows it, then refines it. It does not
  try to collect every detail up front. See
  [`knowledge/domain-discovery.md`](../knowledge/domain-discovery.md).
- **What it asks about:**
  - who uses the product and what they call things;
  - what happens (events), and what triggers it (commands, policies);
  - what must never happen (invariants);
  - where the same word means different things.
  - Whether the product is **multi-tenant**. If it is, every use case takes the tenant first.
- **How it finds boundaries:** a change of language, of actor, or of rate of change.
- **How it classifies each context:**
  - **core** gets a rich domain model;
  - **supporting** gets a simple one, with no aggregates it doesn't need;
  - **generic** (auth, payments, email) gets a recommendation to buy or use a library instead of
    building.
- **Junctions:** a rule that spans two contexts ("when X completes in A, do Y in B") is named,
  declared to belong to neither context, and given an owner exactly once.
- **What it writes:**
  - `docs/product-brief.md`;
  - `docs/context-map.md`, with a mermaid diagram and a Junctions section;
  - per context, a draft glossary and draft scenarios;
  - a list of open questions.

### 2. Decide

A few questions, only where the answer really varies between projects.

- **Frontend:** React, Svelte or Vue, plus "do you need SSR or SEO?". The answer picks Vite or
  Next for React, SvelteKit for Svelte, and Vite or Nuxt for Vue. GYOS runs the framework's
  official scaffolder, then adds its own layer: one folder per context and a typed API client.
  No domain logic lives in the frontend.
- **Testing style:**
  - **BDD + TDD** (recommended). The outer loop is Cucumber scenarios, which come almost ready
    from Discover; they run against each module's controllers with in-memory adapters, not
    through the UI. The inner loop is TDD with Vitest. Playwright covers only the two or three
    critical journeys.
  - **TDD only.** Vitest, no Gherkin.
  - **Pragmatic.** Tests are required, in any order.

  Architecture tests, typecheck and lint run in every style.
- **Logger:** whether the user wants one, and which: none, pino, pino with OpenTelemetry, or
  their own. Follow-up questions: where logs go, trace correlation, readable output in
  development, per-module levels, fields to redact. Every module declares a small logger port; the
  host injects the chosen logger through the module's config. Without one, a module writes only
  warnings and errors to stderr.
- **Everything else has a default.** The defaults are recorded in an ADR so the user can see and
  change them:

  | | Default |
  | --- | --- |
  | Runtime | Node 24 LTS |
  | Workspace | pnpm workspaces + Turborepo |
  | Language | TypeScript strict, ESM, erasable syntax only |
  | Host app | Node + Express (replaceable) |
  | Database | Postgres, one schema per module, docker compose locally |
  | ORM | Drizzle (0.45 / drizzle-kit 0.31 until v1 is `latest`), one `pgSchema` per module |
  | Validation | Zod at every boundary |
  | Module build | `tsc`: ESM and declarations in `dist`, an `@gyos/source` condition → `src` for development |
  | Scenarios | `@cucumber/cucumber` 13 with tsx |
  | Boundaries | Architecture tests in Vitest (layers, module dependencies, migration order) |
  | Quality | ESLint + Prettier, pre-commit hook, GitHub Actions |

### 3. Scaffold

First GYOS shows the plan: every file and module it will create. It writes nothing until the user
agrees. Then, per context:

- the module, following [`standards/module.md`](../standards/module.md);
- its domain skill;
- its `.feature` files.

### 4. Walking skeleton

GYOS builds one thin vertical slice through one context: a migration, an adapter, a use case, an
endpoint, a page and a green scenario. `init` is done when install, typecheck, lint and every
test pass, and not before.

---

## What lands in the user's repo

```
my-product/
  AGENTS.md                 what: stack, commands, rules, contexts and their skills
  CLAUDE.md                 one line: @AGENTS.md
  docs/
    product-brief.md
    context-map.md          contexts, relationships, junctions
    decisions/              why: dated ADRs, append-only
  apps/
    api/                    Express host: composes the modules, owns HTTP and the junctions
    web/                    React / Svelte / Vue
  modules/
    billing/                @module/billing: one bounded context, one Postgres schema
    scheduling/
  .claude/skills/
    billing/                the domain skill for modules/billing
    scheduling/
```

There is no shared package at the start. One is created only when two modules really need the
same primitive, and it never holds domain logic.

---

## Commands

| Command | When | What it does |
| --- | --- | --- |
| `/gyos:init` | once | Runs the four phases and resumes where it stopped |
| `/gyos:discover` | inside `init`, or to refine | Runs the Socratic interview again; updates the brief, the map, the glossaries and the scenarios |
| `/gyos:context` | a new context appears | Runs a short discovery, then creates the module and the skill, and updates the map and the boundary rules |
| `/gyos:feature` | **every day** | Finds the contexts a feature touches and hands it to their skills. A question gets an answer that cites the line, and stops. A change goes clarify → gap analysis → scenario → TDD → verify → hand off, and updates the knowledge files |
| `/gyos:decide` | a choice is made | Writes a dated ADR, project-level or context-level |
| `/gyos:doctor` | any time, CI too | Checks conformance: boundaries, a skill for every module, skills that match the standard, stale knowledge |

**Later:**

- **`/gyos:adopt`** brings GYOS to an existing codebase. It extracts knowledge from the code and
  never invents it.
- **`/gyos:split` / `/gyos:merge`** revise context boundaries.
- **`/gyos:upgrade`** updates generated files when a standard changes. Every generated file
  records the version of the standard it was made from.

---

## This repo

```
.claude-plugin/   plugin.json, marketplace.json
skills/           init/ discover/ context/ feature/ decide/ doctor/
standards/        what GYOS enforces: module.md, domain-skill.md, agents-md.md
knowledge/        what GYOS knows: DDD discovery, modular monolith, ports and adapters,
                  data and migrations, BDD, decision records, KDP itself
templates/        files copied as they are: workspace, module, skill, architecture tests, CI
scripts/          deterministic scaffolding, and the doctor's checks
examples/         one product generated end to end; also the regression test for templates
```

---

## Roadmap

1. **Foundations:** this plan, the module standard, the knowledge base.
2. **Domain skill standard:** the shape of a generated skill. It has four core files (`SKILL.md`,
   `glossary.md`, `architecture.md`, `workflow.md`) and four that appear when earned (`testing.md`,
   `scenarios.md`, `state-of-the-code.md`, `guardrails.md`), plus `development/`.
3. **Templates:** the module template built from the standard, the architecture tests, the
   workspace, CI.
4. **Skills, in order:** `discover` → `init` → `context` → `feature` → `decide` → `doctor`.
5. **Example product** generated end to end in CI.
6. **Later:** `adopt`, `split` / `merge`, `upgrade`.

---

## Decisions

Append-only. A decision that replaces another says which.

| Date | Decision |
| --- | --- |
| 2026-11-25 | GYOS ships as a Claude Code plugin; the repo is its own marketplace |
| 2026-11-25 | Modular monolith only: one deployable, one Postgres schema per module. No microservices option |
| 2026-11-25 | Modules follow ports and adapters, with dependencies injected through a factory (see `standards/module.md`) |
| 2026-11-25 | Fixed defaults, all replaceable. Drizzle is the ORM, Express the host app |
| 2026-11-25 | Modules are ESM packages that ship a build made with `tsc`, as Turborepo recommends for internal packages; the dev loop reads `src` through the `@gyos/source` condition |
| 2026-11-25 | The logger is a choice made at setup. Modules declare a logger port, and the host injects the logger |
| 2026-11-25 | The interview runs in the user's language. Docs are written in English. The glossary keeps the original business term next to the name used in code |
| 2026-11-25 | `adopt` (existing codebases) comes after the MVP; the standards are written so it fits later |
