# Domain discovery

How GYOS turns a product idea into bounded contexts, without inventing what it doesn't know.
Load this when running `/gyos:discover`, when `/gyos:context` sizes up a new context, or when a
boundary is in question.

Sources were checked on 2026-11-25. A source seen only through summaries is marked
**(secondary)**. The full list of sources is at the end.

---

## Contents

1. [Four rules for the interviewer](#four-rules-for-the-interviewer)
2. [What AI is good and bad at here](#what-ai-is-good-and-bad-at-here)
3. [The techniques GYOS borrows from](#the-techniques-gyos-borrows-from)
4. [The interview, step by step](#the-interview-step-by-step)
5. [The question bank](#the-question-bank)
6. [Finding boundaries](#finding-boundaries)
7. [Classifying contexts](#classifying-contexts)
8. [What a context looks like on paper](#what-a-context-looks-like-on-paper)
9. [Relationships between contexts](#relationships-between-contexts)
10. [The glossary](#the-glossary)
11. [How much modelling each context gets](#how-much-modelling-each-context-gets)
12. [Where sources disagree](#where-sources-disagree)

---

## Four rules for the interviewer

1. **Unknowns go into named slots; they are never filled in.**
   - Where they go: an answer nobody has becomes an *open question* or an *assumption*.
   - What they look like elsewhere: the Bounded Context Canvas has fields for both [BCC], Example
     Mapping uses red cards [EM], and EventStorming marks hotspots [ESG]. Same idea every time.
2. **Every answer GYOS proposes carries a label.**
   - The labels: *strong* (the user said it), *inferred* (it follows from what the user said), or
     *speculative* (GYOS's guess).
   - The stance: the agent acts as "a junior domain expert that is allowed to be wrong but must be
     transparent about its assumptions" [KOS].
   - The rule: only *strong* answers enter the glossary, the invariants or the scenarios without
     an explicit confirmation.
3. **Ask for concrete past stories, not opinions about the future.**
   - The question to ask: "Walk me through the last time a customer…" beats "How would customers…".
   - Where to start: the happy path or the most common case, writing assumptions down as you go
     [DST].
   - Why: specifics in the past are harder to make up than opinions about the future (Mom Test,
     secondary) [MOM].
4. **Land, then explore.**
   - The warning: Brandolini cautions against "Grill-me"-style AI interviews, which pull toward a
     "waterfallish approach: give me all the details NOW" [ZAI].
   - What to do instead: reach a plausible model quickly, show it, and refine it through feedback.
   - What the output is: a draft model, not a specification. Discovery never really ends [DSMP].

---

## What AI is good and bad at here

The evidence so far:

| Study | Finding |
| --- | --- |
| Eisenreich et al., 2026 [ARX1] | An LLM did well at ubiquitous language, simulated EventStorming and bounded contexts. At aggregates and architecture, small errors piled up until the result was impractical. Verdict: "a sparring partner… not full automation" |
| ReqElicitGym, 2026 [REG] | Seven LLMs drew out fewer than half of users' implicit requirements, and their effective questions came late in the conversation |
| LLMREI, 2025 [LLMREI] | Across 33 simulated interviews, an LLM interviewer made about as many mistakes as human interviewers |
| Brandolini, 2026 [ZAI] | AI helps most where you are weakest, "and this is also where you'll be fooled" |
| Evans, 2024 [EV] | Experiment with LLMs now, but stay skeptical |

**What GYOS does with this:**

- **The model does what it is good at.** It handles language, events and candidate contexts, and
  the user confirms each checkpoint.
- **Templates and standards do architecture.** Aggregates, layers and module shape are not left to
  the model, which is principle 2 of the plan.
- **The high-yield questions come first.** Because effective questions tend to arrive late, the
  question bank front-loads concrete stories, invariants and edge cases.

---

## The techniques GYOS borrows from

| Technique | What it is | Good for | GYOS uses it for |
| --- | --- | --- | --- |
| **Big Picture EventStorming** [ESG][ES] | Everyone writes domain events in the past tense, then the group orders them on one timeline and marks hotspots, pivotal events, actors, systems and value. The output is "emerging bounded contexts" | A whole business, or a new business model | The timeline of events and the pivotal events |
| **Process EventStorming** [ESG] | One flow, in the grammar: event → policy ("whenever X, we do Y") → command, issued by an actor reading a read model → event | One process in depth | Policies and commands inside a context |
| **Design-level EventStorming** [ESG] | Adds *constraints*: the rules a command must respect (the term replaces "aggregate" with business people) | One bounded context | Invariants |
| **Domain Storytelling** [DST][DSB] | Sentences of the form actor → activity → work object, numbered. One concrete scenario per story, with no conditionals. Small variations go in annotations, big ones in separate stories. Coarse-grained stories reveal boundaries | Language, actors, boundaries | The "walk me through the last time" questions |
| **Example Mapping** [EM] | A yellow card for the story, blue for rules, green for examples, red for questions. Many reds: a lot still to learn. Many blues: the story is too big. Many greens under one rule: several rules tangled together | The invariants of one capability | Per-context invariants and scenarios (see `bdd-and-testing.md`) |
| **User Story Mapping** [USM] | A backbone of user activities, left to right, with stories hanging below. The top slice is the walking skeleton | Flow and scope | Choosing the walking skeleton |
| **DDD Starter Modelling Process** [DSMP] | Understand → Discover → Decompose → Strategize → Connect → Organise → Define → Code. Non-linear. "You cannot skip discovery" | Beginners | The overall order of `/gyos:discover`. "Organise" (team design) rarely applies to a solo founder |

---

## The interview, step by step

`/gyos:discover` follows the Starter Modelling Process loosely. Every step ends by showing the user
what it understood.

1. **Understand: purpose and strategy.**
   - Ask who pays, for what, and why they'd choose this over the alternative.
   - Ask which part would hurt most if copied, and which part they'd happily buy.
   - Feeds the classification of contexts.
2. **Discover: stories and events.**
   - Ask for two or three concrete past stories, happy path first.
   - From them, build the timeline of domain events (past tense), the actors, the triggers and the
     policies.
   - Mark the pivotal events: the moments after which "things are different".
3. **Language.** Collect terms as they come up, and flag every word that seems to mean two things.
4. **Decompose: land.**
   - Propose candidate contexts, each with a purpose in two sentences and the heuristics that
     suggested it.
   - Show the draft context map. This is the first checkpoint, and it should come early.
5. **Explore, per context.**
   - Use Example Mapping for its rules: invariants, edge cases and "must never happen".
   - Ask the consistency question: does this have to be consistent right now, or can it catch up?
6. **Strategize.**
   - Classify each context as core, supporting or generic.
   - Recommend buying a generic one, and keep a supporting one simple.
7. **Connect.**
   - Map the relationships and integration styles.
   - Name the junctions, declare that each belongs to no context, and settle each owner once.
8. **Stop**, when:
   - a few stories per process are covered [DST];
   - each context's purpose fits in two sentences [BCC];
   - the remaining open questions are judged minor [EM].

   The number of open questions is itself the measure of how uncertain the model still is [BCC].

**Multi-tenancy** is asked in step 1, because it changes every use case's signature (module
standard, M11).

---

## The question bank

Ask one question at a time, with a proposed answer, labelled.

**Purpose and strategy** [CDC][BCC]
- Who pays, and for what?
- Why would a customer choose you over the alternative?
- Which part, if a competitor copied it, would hurt most?
- What would you happily buy off the shelf?
- Is the product multi-tenant? Who is a tenant?

**Events and timeline** [DST][ESG][MOM]
- Walk me through the last time a customer went from first contact to done.
- What happens next? What must already have happened before X?
- After which moments are things different? (These are pivotal events.)

**Actors and triggers** [DSB]
- Who does this? Who decides?
- Is it scheduled, or on demand?
- Who needs to know when it happens?

**Policies** [ESG]
- Whenever X happens, what do you always do?
- Is that automatic, or does a person do it?

**Invariants and edge cases** [EM][LK][VV2][UD]
- What must never happen? What must always be true about an X?
- Give me an example where this rule applies, and one where it doesn't.
- Is there another situation where this event leads to a different outcome? (context questioning)
- Is there another outcome that matters? (outcome questioning)
- Should a person confirm this decision? (interaction questioning)
- Does this have to be consistent the moment the user acts, or can it catch up in seconds or hours?
- If someone cancels while someone else ships, what does the business do? Apparent race
  conditions usually hide a missing concept (a refund) or a time window [UD].

**Language**
- What do you call this?
- Does "X" mean the same thing to A and to B?
- Which words are ambiguous, or have no good English equivalent?

**Boundaries** [VWB][ISH][DSB]
- Does this change for different reasons, or at a different pace?
- Could it run as its own SaaS?
- Does information ever flow back from here?

---

## Finding boundaries

A bounded context is a **language and model boundary**, not necessarily a system boundary
[KBC][NT20]. Within it, every term has exactly one meaning [AVBC].

| Heuristic | What to look for | Source |
| --- | --- | --- |
| **Language** | The same word means different things: a "meter" at an electricity company, a "product" in sales, inventory and shipping | [FBC][VBF] |
| **Pivotal events and phases** | What happens before a pivotal event is often a different context from what happens after | [ESG][ISH] |
| **Verbs over nouns** | Nouns pull toward large shared entities; verbs cluster around a shared purpose | [AVBC] |
| **Domain Storytelling indicators** | Information that flows one way only, a change of language, different triggers (daily vs on demand). Three indicators make Hofer "fairly confident", but it is an indication, not proof | [DSB] |
| **Policies** | Design bounded contexts around policies | [KBS] |
| **Rate of change** | Group what changes at the same pace | [VWB] |
| **Natural divisions** | Departments, user bases, lifecycles, goals | [VBF] |
| **Independent Service Heuristics** | Could it be its own SaaS? Clear input data, a small set of personas, its own roadmap, a consistent vocabulary | [ISH] |
| **Purpose test** | Its purpose fits in a few sentences. A wide, incoherent purpose is a big ball of mud forming | [AVBC] |

Nick Tune's five heuristics (secondary): align with the domain language; align with business
value; optimise for social needs; respect technical constraints; don't ignore the user
experience.

**Too big:**
- the purpose can't be stated briefly;
- it contains words with several meanings;
- its Example Map is crowded with rule cards;
- its interface has "too many unique message types" [BCC].

**Too small:**
- the contexts are chatty with each other;
- an example can only be tested end to end across several contexts, which is a coupling smell
  [KBS];
- decomposing finer than bounded contexts, without a reason, produces a distributed big ball of
  mud (Khononov, secondary).

**The quick test:** move something to another context and ask how the design changes [BCC].

**Not a smell:** one subdomain served by several bounded contexts can be a deliberate choice
[VWB].

---

## Classifying contexts

**Core, supporting, generic** [VK]:

| Type | What it is | What to do |
| --- | --- | --- |
| **Core** | The competitive advantage: complex, changes often | Build it in-house, put the best effort here, model it richly |
| **Supporting** | No advantage, but nothing off the shelf fits | Keep it simple: CRUD or a transaction script. If it is complex and won't simplify, it may be a core context in disguise |
| **Generic** | A solved problem: identity, payments, accounting, email | Buy it or use open source, and put it behind a port |

A product may have **no core in software at all**. Don't over-engineer [VK].

**Core Domain Charts** plot business differentiation against model complexity. Prompts to ask:
"How hard would it be for a competitor to match this?" and "What damage would it do if it failed?"
[CDC]. Tune adds that a core that is simple but differentiating is a "first-to-market core": a
warning, because competitors will catch up. A generic area can also become core over time [NT20].

The Canvas classifies along two more axes [BCC]:
- **Role in the business model:** revenue, engagement, compliance.
- **Evolution, in Wardley terms:** genesis, custom built, product, commodity.

---

## What a context looks like on paper

GYOS writes one entry per context in `docs/context-map.md`, using the **Bounded Context Canvas v5**
fields [BCC]:

| Field | Holds |
| --- | --- |
| Name | |
| Purpose | Business language only, two sentences |
| Strategic classification | Core / supporting / generic; revenue / engagement / compliance; evolution |
| Domain roles | For example an analysis context or an execution context |
| Inbound and outbound communication | Messages (command, query, event), collaborators, the relationship |
| Ubiquitous language | The key terms; the full glossary lives in the context's skill |
| Business decisions | Rules and policies |
| Assumptions | What GYOS inferred and the user hasn't confirmed |
| Verification metrics | How you'd know the context is doing its job |
| Open questions | The red cards |

Baas-Schwegler extends the canvas with Given/When/Then examples [KBS]. GYOS does too: they become
the context's first scenarios.

**Brandolini's "domain harness" for AI agents (2026)** [ZAI] has three parts:
- a `Domain-Vision.md` with the business scenario and one paragraph per known context;
- one file per bounded context: narrative, key features, scenarios, integrations, glossary,
  **banned terms**;
- one file per anticorruption layer: rationale, history, translation logic, local glossary.

He calls it "probably the single most effective move". It maps closely onto GYOS's output:

| Brandolini's harness | GYOS |
| --- | --- |
| `Domain-Vision.md` | `docs/product-brief.md` + `docs/context-map.md` |
| One file per bounded context | The context's domain skill |
| One file per anticorruption layer | The port and adapter for that outside system, with its translation documented in the skill's `architecture.md` |
| Banned terms | A column in the glossary |

---

## Relationships between contexts

The context mapping patterns, after Evans [CM]:

| Pattern | Meaning |
| --- | --- |
| **Customer / Supplier** | Upstream and downstream; the downstream's priorities factor into the upstream's planning |
| **Conformist** | The downstream adopts the upstream model as it is, to avoid translating |
| **Anticorruption layer** | The downstream translates the upstream model into its own |
| **Open host service** | The upstream offers one protocol for all its consumers |
| **Published language** | A well-documented exchange language, often with an open host service |
| **Shared kernel** | A small, explicitly shared slice of model and code, changed only by agreement |
| **Partnership** | Two contexts that succeed or fail together, planned together |
| **Separate ways** | No integration at all |
| **Big ball of mud** | A messy area to quarantine |

Keep context maps small, and aim each one at a question [CM].

**In a single-codebase modular monolith** (GYOS's synthesis, not a source). With one team, the
patterns that describe relationships between *teams* mostly collapse. What remains is a choice
about which way a model flows:

| Pattern | Becomes, in GYOS |
| --- | --- |
| Open host service + published language | A module's controllers, `contracts.ts`, vocabulary subpaths and published views |
| Anticorruption layer | A port in the consuming module, and an adapter that translates. Always used in front of outside services (payments, email) |
| Conformist | Acceptable when consuming a generic or supporting module |
| Shared kernel | A tiny shared package (ids, money), created only when needed |
| Separate ways | Duplicate a little data rather than couple |
| Partnership | A smell: revisit the boundary |

How modules then talk at runtime is in `modular-monolith.md`.

---

## The glossary

- **The language is rigorous, and it evolves.** It is tested by using it in conversation, and
  domain experts should object to awkward terms [FUL].
- **There is one ubiquitous language per bounded context,** not one for the whole company [DSD].
- **Words with several meanings:**
  - qualify the term ("a Product, in the context of Shipping, is…") [VBF];
  - translate at the boundary instead of unifying the meanings;
  - treat duplicate sticky notes as a signal: they "might be the same language for different
    concepts" [ESG].
- **Collect terms continuously,** as they come up [KBS].

**GYOS's glossary columns:** term in the business language → identifier in code → definition →
examples → synonyms → banned terms. Terms that must stay verbatim in code are flagged.

**Business language different from the code language: there is no consensus.**
- **Code-switching:** business terms stay in the business language, while keywords, frameworks
  and patterns stay in English, and diacritics are avoided. Example:
  `PlacementSicav.getContrepartie()` [WB][WF].
- **Translating:** identifiers are in English, the original term sits next to each one in the
  docs, and false friends need watching (actual/attuale, eventual/eventuale) [WB].
- **Both sources agree** on what matters: decide consciously, and write the choice down.

GYOS asks at setup and records the answer in an ADR. The default is to translate, keeping the
original term in the glossary's first column.

---

## How much modelling each context gets

- **A rich model** when there are complex rules, invariants, calculations or many scenarios, which
  typically means core. **CRUD or a transaction script** when the experts themselves describe the
  area in CRUD terms, or the logic is mostly input validation [VK]. A supporting context stays
  simple; a generic one is bought and put behind a port.
- **An aggregate is a transactional consistency boundary** that protects *true* invariants
  [VV1][FAG].
  - Vernon's rules: design small aggregates, reference other aggregates by id, and use eventual
    consistency outside the boundary [VV1][VV2].
  - Beware of "false invariants… imposed by developers" [VV1].
- **The architecture can differ per context** [AVBC]:
  - event sourcing is overkill for a draft-like, malleable model;
  - some contexts barely need behaviour or persistence;
  - pivotal events still make good integration events, even when a context is CRUD inside.

This is why the module standard's `<area>/domain/` can be nearly empty in a supporting context,
and rich in a core one: the shape is the same, the depth is not.

---

## Where sources disagree

- **The subdomain types are contested.** Khononov notes that Evans and Vernon "were not fans" of his
  complexity-based definitions [VK]. Tune calls the categories vague [NT20]. GYOS uses them as a
  conversation tool, not as a law.
- **Contexts vs subdomains.** Verraes: ideally one-to-one, but splitting one subdomain across
  several contexts can be deliberate [VWB]. Fowler: the dominant factor in drawing boundaries is
  human culture [FBC].
- **Departments as boundaries.** Verraes and Baas-Schwegler suggest departments as natural
  divisions. The EventStorming glossary, citing Brandolini, calls swimlanes "tempting": they're
  readable, but they risk freezing today's org chart into the model.
- **Business terms in code:** no consensus (see the glossary section).
- **Not verified from primary sources:**
  - Tune's five heuristics;
  - Khononov's book, both the "too fine" sizing claim and the decision tree from transaction
    script to event sourcing;
  - the contents of Brandolini's Leanpub chapter, quoted only via ddd-crew;
  - the Mom Test, read only through summaries.

  Brandolini's 2026 deck was read as terse slide text, so its interpretation here may be off.

---

## Sources

- [BCC] https://github.com/ddd-crew/bounded-context-canvas
- [DSMP] https://github.com/ddd-crew/ddd-starter-modelling-process
- [CM] https://github.com/ddd-crew/context-mapping
- [CDC] https://github.com/ddd-crew/core-domain-charts
- [ESG] https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet
- [ES] https://www.eventstorming.com/
- [AVBC] https://www.avanscoperta.it/en/bounded-context/
- [ZAI] https://speakerdeck.com/ziobrando/ai-powered-domain-driven-design
- [DST] https://domainstorytelling.org/quick-start-guide
- [DSD] https://domainstorytelling.org/domain-driven-design
- [DSB] https://www.infoq.com/news/2018/02/storytelling-domain-contexts
- [EM] https://cucumber.io/blog/bdd/example-mapping-introduction/
- [USM] https://www.jpattonassociates.com/the-new-backlog/
- [ISH] https://github.com/TeamTopologies/Independent-Service-Heuristics
- [VWB] https://verraes.net/2021/06/split-domain-across-bounded-contexts/
- [VBF] https://verraes.net/2014/02/buzzword-free-bounded-contexts/
- [KBS] https://xebia.com/blog/extending-the-bounded-context-canvas-with-bdd-examples/
- [KBC] https://xebia.com/blog/cultural-needs-designing-bounded-contexts/
- [NT20] https://www.infoq.com/news/2020/02/bounded-contexts-ddd-europe/
- Tune, 2019 slides (secondary): https://www2.slideshare.net/AgileIndia2019/strategic-domaindriven-design-by-nick-tune-at-agileindia2019
- [FBC] https://martinfowler.com/bliki/BoundedContext.html
- [FUL] https://martinfowler.com/bliki/UbiquitousLanguage.html
- [FAG] https://martinfowler.com/bliki/DDD_Aggregate.html
- [VK] https://vladikk.com/2018/01/26/revisiting-the-basics-of-ddd/
- [WF] https://webfactory.de/blog/ubiquitous-language-in-a-non-english-domain
- [WB] https://noti.st/punkstarman/WLhpbe
- [UD] https://udidahan.com/2010/08/31/race-conditions-dont-exist/
- [VV1] https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf
- [VV2] https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf
- [LK] https://lizkeogh.com/2011/09/22/conversational-patterns-in-bdd/ and https://lizkeogh.com/2026/01/23/a-third-conversational-pattern-in-bdd/
- [MOM] (secondary) https://mtlynch.io/book-reports/the-mom-test/
- [ARX1] https://arxiv.org/abs/2603.26244
- [REG] https://arxiv.org/abs/2602.18306
- [LLMREI] https://arxiv.org/abs/2507.02564
- [KOS] https://2026.dddeurope.com/program/can-ai-be-a-co-domain-expert-in-domain-modelling/
- [EV] https://www.infoq.com/news/2024/03/Evans-ddd-experiment-llm/
