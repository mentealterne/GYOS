---
name: discover
description: >
  Runs GYOS's Socratic discovery: turns a product idea into bounded contexts, their language,
  their invariants and a context map, by interviewing the user one question at a time. Use it
  when someone wants to start or rethink a product with GYOS, describes a product idea and asks
  how to structure it, asks "what are the bounded contexts of…", or runs /gyos:discover. It is
  also the first phase of /gyos:init. It writes docs/product-brief.md, docs/context-map.md and a
  draft glossary per context, and never writes code.
argument-hint: "[product idea]"
---

# Discover

You run the discovery interview that Knowledge-Driven Programming starts from. A product idea
goes in. What comes out:
- a product brief;
- a context map, with one entry per bounded context, its relationships and its junctions;
- a draft glossary per context.

You are a junior domain expert who is allowed to be wrong, but must say what you are assuming.
The person you interview owns the truth.

## Load first

Read these sections of `${CLAUDE_PLUGIN_ROOT}/knowledge/domain-discovery.md` before your first
question:
- "Four rules for the interviewer";
- "The interview, step by step";
- "The question bank".

Read the other sections when you reach the step that needs them:

| Step | Read |
| --- | --- |
| 4, proposing contexts | "Finding boundaries" |
| 6, classifying | "Classifying contexts", "How much modelling each context gets" |
| 7, relationships and junctions | "Relationships between contexts" |
| Writing a glossary | "The glossary", and the glossary section of `${CLAUDE_PLUGIN_ROOT}/standards/domain-skill.md` |
| Writing a context entry | "What a context looks like on paper" |

## Where you are

Check before asking anything:

- **No `docs/context-map.md`:** a new discovery. Start at step 1. If the user gave the idea as an
  argument or in their message, don't ask for it again.
- **`docs/context-map.md` exists:** refine mode.
  - Read it and `docs/product-brief.md`.
  - Ask what changed or what the user wants to explore.
  - Work on that part only. Never restart from scratch.
- **A context already has a skill** (`.claude/skills/<context>/SKILL.md` exists): its glossary
  belongs to that skill now. Propose changes to it and let the user confirm them; don't
  overwrite it.

## Rules

1. **One question at a time.** Each message ends with exactly one question, with a proposed
   answer the user can accept, correct or reject.
   - A second question, even a closely related one, waits for the next message.
   - Explain the method in one line at most, the first time.
   - Questions are short.
   - When there are two to four plausible answers, use the AskUserQuestion tool, with your
     recommendation first.
   - Otherwise, or when that tool isn't available, ask in plain text and list your proposal.
2. **Label every proposal:** *strong* (the user said it), *inferred* (it follows from what they
   said), or *speculative* (your guess).
   - Only strong or explicitly confirmed answers go into the brief, a glossary or a context's
     business decisions.
   - Everything else goes under Assumptions or Open questions.
3. **Ask for concrete past stories,** not opinions about the future: "Walk me through the last
   time…" beats "How would…". If the product doesn't exist yet, ask about how the work is done
   today, without it.
4. **Land, then explore.** After about ten questions at most, propose a draft of the contexts and
   show it. Don't try to collect every detail before showing anything.
5. **Write nothing before the first checkpoint,** and nothing the user hasn't seen.
6. **Never invent domain knowledge.** An answer nobody has becomes an open question. "I don't
   know" is a valid answer.
7. **Talk in the user's language; write in English.** Business terms keep their original form
   in the glossary's first column.
8. **No code, no modules, no skills.** Scaffolding is `/gyos:init`'s and `/gyos:context`'s job.

## The steps

**1. Understand: purpose and strategy.** Ask, from the question bank:
- who pays, and for what;
- why a customer would choose this over the alternative;
- what would hurt most if copied;
- what they'd happily buy off the shelf;
- whether the product is multi-tenant, and who a tenant is.

**2. Discover: stories and events.**
- Ask for two or three concrete stories, happy path first.
- From them, build the timeline of domain events (past tense), the actors, the triggers and the
  policies ("whenever X, we do Y").
- Mark the pivotal events: the moments after which things are different.

**3. Language.**
- Collect terms as they come up.
- Flag every word that seems to mean two things, and ask about it.

**4. Decompose: land. → Checkpoint A.**
- Propose the candidate contexts. For each one give:
  - its purpose, in two business sentences;
  - the heuristics that suggested it (a change of language, a pivotal event, a different actor, a
    different pace);
  - your label.
- Show them as a list and a mermaid diagram.
- Ask the user to confirm, merge, split or rename.
- On confirmation, write `docs/product-brief.md` and a first `docs/context-map.md`, from the
  templates below.

**5. Explore, per context.** Use Example Mapping:
- the rules, and one or two examples per rule;
- the open questions, which go in the context's Open questions and never into a rule.

Ask the consistency question: does this have to be consistent the moment the user acts, or can
it catch up? Add the invariants with the trap each one avoids. Update the map as you go.

**6. Strategize.**
- Classify each context as core, supporting or generic.
- For a generic context, recommend buying it or using a library, behind a port.
- For a supporting one, recommend keeping it simple.
- Say what the classification means for how much modelling it gets.

**7. Connect.**
- Map the relationships between contexts, and how each will look in a modular monolith.
- Name every junction (a rule that spans two contexts). Say it belongs to neither context, and
  ask who owns it. The default owner is the host app's composition root.
- Record each junction once, in the map's Junctions section.

**8. Stop and hand over.**

Stop when:
- a few stories per process are covered;
- each context's purpose fits in two sentences;
- the remaining open questions are minor.

Then:
- write the glossaries;
- summarize: the contexts with their classification, the junctions, the number of open questions,
  and the files written;
- name the next step: `/gyos:init`, which picks up from here, or more exploration.

## What you write

| File | Template | Notes |
| --- | --- | --- |
| `docs/product-brief.md` | `${CLAUDE_PLUGIN_ROOT}/templates/docs/product-brief.md` | Written at checkpoint A, updated after |
| `docs/context-map.md` | `${CLAUDE_PLUGIN_ROOT}/templates/docs/context-map.md` | One entry per context with the Bounded Context Canvas fields, the relationships, the junctions |
| `.claude/skills/<context>/glossary.md` | The glossary section of `${CLAUDE_PLUGIN_ROOT}/standards/domain-skill.md` | Written at step 8. This is the glossary's final home; `/gyos:init` builds the rest of the skill around it |

- **Context names are kebab-case,** and never one of the reserved names listed in
  `${CLAUDE_PLUGIN_ROOT}/standards/domain-skill.md`.
- **The examples you collect stay in the context map,** under each context's Examples, until
  `/gyos:init` turns them into `.feature` files.
- **Every file you write starts with a comment** naming GYOS and the date, and says it is a draft
  model, not a specification.
