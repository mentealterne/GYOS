# Knowledge base

What GYOS knows. The standards in `standards/` say what GYOS enforces. The files here say why,
with sources, so that a skill can explain a choice instead of just asserting it.

Skills load these files **in pieces, when the situation calls for them**, never all at once.

| File | Load it when |
| --- | --- |
| [`knowledge-driven-programming.md`](knowledge-driven-programming.md) | Always first: why everything else exists |
| [`domain-discovery.md`](domain-discovery.md) | Running the Socratic interview, finding bounded contexts, classifying subdomains |
| [`modular-monolith.md`](modular-monolith.md) | Deciding module boundaries, how modules talk, what they share |
| [`ports-and-adapters.md`](ports-and-adapters.md) | Scaffolding or reviewing a module: layers, dependency injection, configuration, the logger |
| [`data-and-migrations.md`](data-and-migrations.md) | Anything touching the database: schema per module, Drizzle, migrations, published views |
| [`bdd-and-testing.md`](bdd-and-testing.md) | Choosing a testing style, writing scenarios, wiring Cucumber |
| [`decision-records.md`](decision-records.md) | Recording a decision, confronting a request with past decisions, writing `AGENTS.md` |

## Rules for this folder

- **Every claim cites its source.** A link to a primary source (the author's book site, blog or
  repo, or official docs) beats a summary of one.
- **Disagreements are stated, not resolved silently.** Where sources disagree, the file says so
  and says which side GYOS takes, and why.
- **Version-dependent details carry a version and a date.** "As of <tool> <version>
  (<month year>), it does X" ages honestly; "<tool> does X" does not.
- **No ceremony.** A file that would hold one apologetic paragraph is not written.
