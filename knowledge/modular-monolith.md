# The modular monolith

Why GYOS builds one deployable split into modules, and what the literature says about keeping it
that way. Load this when drawing module boundaries, deciding how two modules talk, or deciding
what may be shared.

Sources were checked on 2026-11-25. Version-dependent details are marked **[version]**.

---

## What it is, and why GYOS chooses it

- **The definition.** A monolith is one deployment unit. A *modular* monolith adds modules that
  are independent, organized around business areas, encapsulated, and reachable only through a
  defined contract: a facade, or events they publish.
  ([Grzybek: Modular Monolith primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer))
- **Shopify's version.** "All of the code powers a single application and there are strictly
  enforced boundaries between different domains." Shopify chose it over microservices to avoid
  separate pipelines, network latency and refactoring across services.
  ([Deconstructing the monolith](https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity))
- **Monolith first.** Martin Fowler argues that getting service boundaries right up front is
  hard, and that moving functionality between services is expensive. He favours starting with a
  monolith designed with modular APIs *and* modular data storage.
  ([MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html))
- **What goes wrong.** Simon Brown: a big ball of mud can be monolithic or distributed, so
  "choose microservices for the benefits, not because your monolithic codebase is a mess".
  ([Modular monoliths, GOTO 2018](https://files.gotocon.com/uploads/slides/conference_12/515/original/gotoberlin2018-modular-monoliths.pdf))
  Sam Newman calls the modular monolith a "highly underrated option", but warns that teams lose
  discipline and slide back into a ball of mud. He suggests data ownership per module as a hedge
  for startups.
  ([Newman, QCon](https://www.infoq.com/presentations/microservices-principles-patterns/))

**GYOS's position.** Its users are product engineers setting up a new product, often alone or in
a small team. For them, network boundaries are cost without benefit. What they need is boundaries
that hold, and Brown and Newman agree that boundaries hold only when something enforces them.
GYOS therefore offers no microservices option, and spends that effort on enforcement instead:
architecture tests, schema ownership, and one-way dependencies.

---

## Drawing module boundaries

- **One module per bounded context: a business slice, never a technical layer.**
  ([Grzybek primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer);
  [Richardson, part 7](https://microservices.io/post/architecture/2024/05/13/how-modular-can-your-monolith-go-part-7-no-such-thing-as-a-modular-monolith.html))
- **Judge a module's independence** by how many dependencies it has, how strong they are and how
  stable they are. Strong, chatty dependencies between two modules suggest merging them.
  (Grzybek primer)
- **Private by default.** A module exposes a small, stable contract, and anything shared becomes
  public API.
  ([Grzybek: architecture enforcement](https://www.kamilgrzybek.com/blog/posts/modular-monolith-architecture-enforcement))
- **APIs shaped by the caller's use case** (`getOrderForShipping`), not by generic data access.
  Start with nothing public.
  ([Jovanović: internal vs public APIs](https://milanjovanovic.tech/blog/internal-vs-public-apis-in-modular-monoliths))
  This matches the module standard's M12: the surface grows with use cases.
- **The API also hides the schema.** Chris Richardson calls this the "domain module API" pattern.
  ([Modular monolith patterns for fast flow](https://microservices.io/post/architecture/2024/09/09/modular-monolith-patterns-for-fast-flow.html))
- **A provided interface and a required interface.** Spring Modulith splits a module into a
  *provided interface* (its API and the events it publishes), its *internals*, and a *required
  interface* (what it consumes). Its checks fail on cycles between modules and on any use of
  another module outside its API.
  ([fundamentals](https://docs.spring.io/spring-modulith/reference/fundamentals.html),
  [verification](https://docs.spring.io/spring-modulith/reference/verification.html))

  In GYOS terms, the provided interface is the controllers, `contracts.ts` and the published
  views; the required interface is the module's ports.

**Heuristics that a boundary is wrong:**
- the two modules are chatty;
- one module's tests need many stubs of the other;
- a single operation needs an atomic write across both.

Any of these means the boundary should be merged or re-cut.

---

## How modules talk

Kamil Grzybek describes four integration styles
([Integration styles](https://www.kamilgrzybek.com/blog/posts/modular-monolith-integration-styles)):

| Style | Coupling | Consistency | In GYOS |
| --- | --- | --- | --- |
| Shared data | Highest | Strong | **Never.** No shared tables, no cross-schema joins except published views |
| Direct call | Lower | Strong | Queries, and commands that need an answer now: a controller call |
| Messaging | Lowest | Eventual | Reactions and side effects |
| File transfer | — | — | Not used |

He recommends mixing direct calls and messaging.

**Integration events are public contracts.**
- Keep them small: no "fat events".
- Domain events stay inside their module. (Grzybek)

**Observers.** Richardson uses observer, or pub/sub, so that a module can trigger follow-up actions
without depending on the modules that perform them
([domain observers](https://microservices.io/post/architecture/2023/10/30/how-modular-can-your-monolith-go-part-5-domain-observers.html)).
GYOS's default is the simplest form of this: the module declares a port in its own language (a
notifier), and the host's composition root implements it by calling the other module. That is
also where a junction's ownership is written down.

**When a reaction must survive a crash, use an outbox.**
- The emitting module writes the event to an outbox table in its own schema, in the same
  transaction as the change.
- A relay delivers it at least once.
- Consumers are therefore idempotent: they record the ids of the messages they have processed.

([Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html),
[Idempotent consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html))
Grzybek's reference implementation uses an outbox, an inbox, internal command tables and an
in-memory bus ([modular-monolith-with-ddd](https://github.com/kgrzybek/modular-monolith-with-ddd)).

**Spring Modulith's lesson for event handlers.**
- A synchronous listener widens the transaction.
- A plain asynchronous listener can lose events.
- Its default runs after commit, in a new transaction, backed by a persisted registry of
  publications.

([events](https://docs.spring.io/spring-modulith/reference/events.html))
Whatever GYOS ships for events has to make the same distinction.

**Where sources disagree.**
- *Events or direct calls by default?* Spring Modulith makes events primary, and Grzybek's
  reference repo is strictly asynchronous. Grzybek's blog, Richardson and Jovanović mix the two.
  **GYOS mixes them:** direct calls first, events when the caller shouldn't know who reacts.
- *Cross-module transactions?* Richardson argues that a single ACID transaction is simpler and
  fine inside a monolith. Grzybek forbids them. Jovanović treats them as an escape hatch.
  **GYOS forbids them.** It follows from schema ownership: a write that needs two modules
  atomically is a sign the boundary is wrong.

---

## Data isolation

- **One schema per module, no constraints between modules, no transactions between them.**
  (Grzybek, Integration styles)
- **Enforce it in the database too, not only in code.** Jovanović recommends:
  - a Postgres role per module, with privileges only on its own schema;
  - a migration history per module, inside its schema;
  - cross-module screens served from a read model fed by events, or from a read-only view granted
    to a role.

  ([Keeping data boundaries intact](https://milanjovanovic.tech/blog/how-to-keep-your-data-boundaries-intact-in-a-modular-monolith))
- **Postgres itself allows foreign keys across schemas.** Only privileges stop them: a foreign key
  needs the `REFERENCES` privilege, and reading another schema needs `USAGE` on it.
  ([Postgres: privileges](https://www.postgresql.org/docs/current/ddl-priv.html))
- **Schema first, separate database later.** A module moves to its own database only when it needs
  independent scaling or backup, or is about to be extracted.
  ([Schema vs database per module](https://milanjovanovic.tech/blog/schema-per-module-vs-database-per-module))

**GYOS's position.**
- **On by default:** a schema per module, a migration history inside it, no foreign keys out of
  it, and published views for lists that span modules.
- **Optional hardening, off by default:** one Postgres role per module. Roles also mean one
  connection per module. The production identity module behind the standard postponed roles and
  relied on tests and a lint rule. GYOS does the same, and records the choice in an ADR the user
  can reverse.

---

## Enforcing boundaries in TypeScript

Grzybek's order of preference is: the compiler first, then automated architecture tests, then
code review as the last line of defence, with ADRs to make reviews faster
([architecture enforcement](https://www.kamilgrzybek.com/blog/posts/modular-monolith-architecture-enforcement)).
Brown says the same: "try to use the compiler to enforce boundaries".

**The compiler: package `exports`.**
- Each module is a workspace package with an `exports` map, so a deep import fails to resolve. The
  Node docs call this "not a strong encapsulation"
  ([Node packages](https://nodejs.org/api/packages.html)), but it is the first line.
- TypeScript honours `exports` only with `moduleResolution` set to `node16`, `nodenext` or
  `bundler`.
- **tsconfig `paths` bypass `exports` entirely**
  ([TS modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference.html)).
  GYOS allows `paths` only for a module's own `src/`, never to reach another package.
- pnpm doesn't hoist undeclared dependencies by default, so importing a module that isn't listed
  in `package.json` fails. Shopify learned that the real proof of isolation was running a
  package's tests with only its declared dependencies loaded; static analysis alone missed
  problems ([Packwerk retrospective](https://shopify.engineering/a-packwerk-retrospective)).

**Architecture tests.** The options, **[version]** as of 2026-11:

| Tool | Version | What it does |
| --- | --- | --- |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) | 18.9 | Forbidden rules with group matching (`$1`), so "no imports between sibling modules" is one rule; cycle detection |
| [eslint-plugin-boundaries](https://www.jsboundaries.dev/docs/rules/) | 7.4.5 | `boundaries/dependencies` is now the main rule; `element-types`, `entry-point` and `no-private` are deprecated, so older configs found online are out of date |
| [Nx enforce-module-boundaries](https://nx.dev/docs/features/enforce-module-boundaries) | v24 | Tag-based constraints, between Nx projects only |
| [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS) (`archunit`) | 2.5.5 | Architecture tests in Jest or Vitest, including `haveNoCycles`; with Vitest it needs `globals: true` |
| [Sheriff](https://github.com/sheriff-arch/sheriff) | 0.21 | `index.ts` as each module's API, with tag rules; still 0.x |

**GYOS's choice: hand-written architecture tests in Vitest.** They parse imports with the
TypeScript compiler API, as in the production module the standard comes from.
- They need no extra dependency.
- Each rule is a few lines that read like the standard.
- Next to every rule there is a synthetic violation that the rule must report, so a check that
  can't fail is caught.

dependency-cruiser is the alternative if a team prefers configuration to code; that choice goes
in an ADR.

---

## Testing a modular monolith

- **Grzybek:** test each module through its public command and query API against the real
  database engine. Stub only what you don't control (email, outside APIs). Add architecture tests,
  and a separate layer of system integration tests. (modular-monolith-with-ddd README)
- **Spring Modulith** runs each module's tests in isolation by default and stubs the other modules.
  Needing many stubs is a coupling smell: replace those calls with events.
  ([testing](https://docs.spring.io/spring-modulith/reference/testing.html))
- **Brown:** test components as black boxes, through their interface.

**Where sources disagree.** Grzybek tests modules against the real database. The BDD tradition
(see `bdd-and-testing.md`) runs scenarios against in-memory adapters. **GYOS does both, for
different jobs:**
- scenarios on in-memory adapters, for the product promises, fast;
- integration tests on a real Postgres, for the adapters, the migrations and the published views.

---

## Anti-patterns

| Anti-pattern | Why it hurts | Source |
| --- | --- | --- |
| A "common" or "platform" junk drawer | It grows until everything depends on it. Keep a small, governed shared kernel instead: base types, `Result`, id types, event interfaces. No utilities, no infrastructure | [Jovanović: shared kernel](https://milanjovanovic.tech/blog/shared-kernel-pattern-modular-monolith); Packwerk retrospective |
| A dense or cyclic dependency graph | A public API over cyclic dependencies is "just an added layer of indirection". Break cycles with inversion of control or events | [Shopify: under deconstruction](https://shopify.engineering/shopify-monolith) |
| Privacy without a dependency graph | Packwerk 3.0 removed its privacy checks for this reason: the graph matters more | Packwerk retrospective |
| Grouping by name instead of by runtime dependency | Shopify's "shop billing settings" held fraud data needed on every request; it belonged at the base of the graph, not in billing | Packwerk retrospective |
| Shared tables, cross-module joins, foreign keys or transactions | Every one of them is a coupling the module boundary can't see | Grzybek |
| Technical-layer "modules" | A module per layer is not a module | Grzybek; Richardson |
| Fat integration events, or domain events leaking out | They turn internals into public contracts | Grzybek |
| Fire-and-forget asynchronous handlers | They lose events | Spring Modulith |
| Distributed-monolith habits in-process | Most integration can happen in memory, without a message platform | [InfoQ](https://www.infoq.com/news/2019/09/design-ddd-modular-monolith) |

**The dissent worth knowing.** Stefan Tilkov argues against starting with a monolith, because
in-process boundaries "rarely" survive in practice
([Don't start with a monolith](https://martinfowler.com/articles/dont-start-monolith.html)). GYOS
reads that as an argument for strict enforcement rather than against the modular monolith.

**Terminology.** Richardson prefers "domain-oriented component" to "modular monolith". Shopify
found that pure domain components didn't match how code actually runs, and now groups
function-based packages under domain components.

---

## If a module ever leaves

GYOS doesn't offer extraction, but the boundaries are built so that it stays possible:

- **Extract only for a concrete reason:** very uneven load, a different deployment cadence, a
  different technology need, or fault isolation.
- **Extract only once the module is ready:** a clean API, isolated data, event-based communication.
  Anything less produces a distributed monolith.
  ([When to extract a module](https://milanjovanovic.tech/blog/when-to-extract-module-to-microservice))
- **Move it gradually,** with a strangler fig
  ([StranglerFigApplication](https://martinfowler.com/bliki/StranglerFigApplication.html)).

**Caveats about these sources.**
- Simon Brown's line "if you can't build a monolith…" is known only in paraphrase.
- Newman's view here comes from a talk transcript, not his book.
- Jovanović's posts are a practitioner blog with .NET examples, not a standards body.
- Spring Modulith's own docs say its built-in event externalization "lacks critical features" of a
  real outbox.
