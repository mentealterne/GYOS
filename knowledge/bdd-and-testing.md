# BDD and testing

How GYOS products prove that they work, and that they are true. Load this when choosing a testing
style at setup, writing scenarios, or wiring Cucumber into a module.

Sources were checked on 2026-11-25. Version-dependent details are marked **[version]**.

---

## The shape GYOS recommends: the double loop

- **The outer loop** is a failing scenario (Cucumber). It states a product promise in the
  language of the people who use the product.
- **The inner loop** is red-green-refactor unit cycles (Vitest), which drive the code that makes
  the scenario pass.

This is the double loop described in Freeman and Pryce's *Growing Object-Oriented Software*.
Cucumber's own team adds a warning: Cucumber isn't BDD. The tool is not the practice; the
conversation that produces the examples is.
([Cucumber: BDD and TDD](https://cucumber.io/blog/bdd/intro-to-bdd-and-tdd/))

BDD comes from Dan North (2006). He introduced "behaviour" as a more useful word than "test",
the Given/When/Then template, executable acceptance criteria, and a shared ubiquitous language.
([Introducing BDD](https://dannorth.net/blog/introducing-bdd/))

**Why it suits KDP.** A scenario is a product promise that both a person and the machine can
read. It is the place where "true" (the business decided this) becomes "works" (a test checks
it).

### The three styles offered at setup

| Style | Outer loop | Inner loop | When |
| --- | --- | --- | --- |
| **BDD + TDD** (recommended) | Cucumber scenarios per module | Vitest, test first | Default. Discovery already produces most of the scenarios |
| **TDD only** | — | Vitest, test first | Teams that won't maintain Gherkin |
| **Pragmatic** | — | Vitest, in any order | Spikes and prototypes. Tests are still required |

Architecture tests, typecheck and lint run in every style.

---

## Scenarios run below the UI

GYOS scenarios call a module's **controllers**, wired to **in-memory adapters**. They don't go
through HTTP or a browser.

- **This is a subcutaneous test:** fast and stable, but only safe when the UI holds no logic.
  ([Fowler: SubcutaneousTest](https://martinfowler.com/bliki/SubcutaneousTest.html)) GYOS keeps
  domain logic out of the frontend for exactly this reason.
- **Ports and adapters make the in-memory fakes legitimate:** the domain is isolated from
  infrastructure, so a fake behind the same port exercises the same rules.
  ([Matt Wynne on hexagonal architecture](https://blog.mattwynne.net/tag/hexagonal-architecture/))
- **The real adapters are proven by integration tests** against a real Postgres. The UI is
  proven by a few Playwright journeys. Scenarios don't try to do either job.

In the module standard, the scenarios build the controllers with the in-memory adapters from
`features/support/`. That is the same wiring `index.ts` does, with fakes instead of Drizzle. The
unit tests reuse those adapters, so a phrase like "Giulia is an HR director" means the same thing
everywhere.

---

## From conversation to scenarios: Example Mapping

Example Mapping (Matt Wynne) is the bridge from the discovery interview to Gherkin. Each colour of
card maps onto a Gherkin element:

| Card | Holds | Becomes |
| --- | --- | --- |
| Yellow | The story | `Feature:` |
| Blue | A rule | `Rule:` |
| Green | An example of the rule | `Example:` / `Scenario:` |
| Red | A question nobody can answer yet | An open question, **kept out of the scenarios** |

- **Time-box it** to about 25 minutes.
- **Many red cards** mean the story isn't ready.
- **Many blue cards** mean the story should be sliced.
- **Don't write formal Gherkin during the session.** Capture rough examples and formulate them
  afterwards.

([Example Mapping introduction](https://cucumber.io/blog/bdd/example-mapping-introduction/),
[Cucumber docs: Example Mapping](https://cucumber.io/docs/bdd/example-mapping/))

**In GYOS:**
- `/gyos:discover` collects rules, examples and questions per context while it interviews.
- Red cards go to the open-questions list, never into a scenario.
- `/gyos:feature` runs the same mapping for one feature before it writes any Gherkin.

---

## Writing good scenarios

**Declarative, not imperative.** A step says what happens, not how: `When Bob signs in`, not a
step per form field. The test to apply: will this wording have to change if the implementation
does? ([Better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/))

**BRIEF** (Seb Rose and Gáspár Nagy):

| Letter | Rule |
| --- | --- |
| **B**usiness language | Avoid words that mean different things in different contexts, such as user, account, address. The context's glossary is the fix |
| **R**eal data | Concrete values, not placeholders |
| **I**ntention-revealing | No UI terms |
| **E**ssential | No incidental detail |
| **F**ocused | One rule per scenario |
| **Brief** | Five lines or fewer |

([Keep your scenarios BRIEF](https://cucumber.io/blog/bdd/keep-your-scenarios-brief/)). Rose and
Nagy's *Discovery* and *Formulation* are now combined in Manning's *Effective Behavior-Driven
Development* ([bddbooks.com](https://bddbooks.com/)).

**Structure** ([Gherkin reference](https://cucumber.io/docs/gherkin/reference/)):
- **3–5 steps per example.** A Given sets up state and mentions no user interaction. A When is a
  single event. A Then is the outcome.
- **`Rule:`** (Gherkin 6+) groups the examples that illustrate one business rule. A Rule can have
  its own `Background`.
- **`Background:`** holds only the context the reader needs, at most about four lines. Use vivid
  names ("Free Frieda", not "User A"). If it scrolls off the screen, split the file.
- **`Scenario Outline:`** only when the rows are genuinely different examples of the same rule.
  (GYOS's reading of Essential and Focused; not a quoted rule.)

**Living documentation.** Declarative scenarios read as documentation of the product
([Better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/)). In GYOS, a context skill's
`scenarios.md` points at its `.feature` files instead of repeating them.

---

## Cucumber.js with TypeScript and ESM

**[version] As of `@cucumber/cucumber` 13.3.0 (released 2026-10-05):**
- It needs Node 22, 24 or ≥ 26. Version 13.0 dropped Node 20 and 25.
- Parallel workers are **worker threads**, sharing memory with the main thread.
- `BeforeAll`/`AfterAll` hooks always run, even after an earlier hook fails.
- 13.2 added `HookTarget.COORDINATOR` for run-wide hooks.
- 13.3 allows a data table and a doc string on the same step.

([CHANGELOG](https://github.com/cucumber/cucumber-js/blob/main/CHANGELOG.md),
[UPGRADING](https://github.com/cucumber/cucumber-js/blob/main/UPGRADING.md))

**The official recipe for ESM and TypeScript.** Register tsx in a small file, then load the
support code with **`import`, not `require`**, listing the register file first.
([transpiling](https://github.com/cucumber/cucumber-js/blob/main/docs/transpiling.md),
[ESM](https://github.com/cucumber/cucumber-js/blob/main/docs/esm.md))

```js
// tsx-register.js
import { register } from "tsx/esm/api";
register();
```

```js
// cucumber.mjs: auto-discovered, one per module
export default {
  paths: ["features/**/*.feature"],
  import: ["./tsx-register.js", "features/support/**/*.ts", "features/steps/**/*.ts"],
  format: ["progress", "html:reports/cucumber.html"],
};
```

- **A config written in TypeScript** (`cucumber.ts`, `.mts`, `.cts`) loads through Node's
  built-in type stripping **[version ≥ 12.4.0]**. It is not auto-discovered, so it needs
  `--config cucumber.ts`.
  ([configuration](https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md))
  GYOS uses `cucumber.mjs` and keeps the default discovery.
- **The World** is a fresh instance per scenario. The in-memory adapters live there, so isolation
  comes for free. In TypeScript, type `this` explicitly.
  ([World](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/world.md),
  [hooks](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/hooks.md))
- **Verified** on 2026-11-25: this recipe runs `@cucumber/cucumber` 13.3.0 with tsx 4.23 under
  ESM, on Node 24.6 and 24.22, with `Rule:`, a custom parameter type and an `After` hook
  (`templates/module`). A failing step fails the run.
- **tsx doesn't add Node conditions.** Support code that imports another workspace module gets its
  `dist/` unless Node runs with `--conditions=@gyos/source`; the module's script sets it with
  `NODE_OPTIONS=--conditions=@gyos/source cucumber-js` (verified: without it, the import failed
  before a build).

**What GYOS does not rely on yet:**

- **Dropping tsx for Node's native type stripping.** Node strips types by default since
  22.18 / 23.6, and stripping is stable since 24.12 / 25.2
  ([Node TypeScript docs](https://nodejs.org/api/typescript.html)). A maintainer confirmed that
  imported `.ts` files are stripped natively
  ([cucumber-js#2548](https://github.com/cucumber/cucumber-js/issues/2548)). But it isn't in the
  official guide, and it rules out `enum`, parameter properties, namespaces and tsconfig `paths`.
- **`parallel`.** Whether tsx registration works inside 13.x worker threads is not documented.
  Turn it on only after checking.

### Alternatives

| Runner | Version (2026-11) | How it works | Why GYOS doesn't default to it |
| --- | --- | --- | --- |
| [quickpickle](https://github.com/dnotes/quickpickle) | 1.11.2 | A Vitest plugin: one runner and one watch mode for scenarios and unit tests | No Cucumber tag expressions (only `-t` name matching), no attachments; the World is passed as an argument; reports are Vitest's |
| [@amiceli/vitest-cucumber](https://github.com/amiceli/vitest-cucumber) | 8.0.1 | Steps written inline per scenario in `.spec.ts`, and scenarios missing from code are flagged | Little step reuse |
| [playwright-bdd](https://github.com/vitalets/playwright-bdd) | 9.2.1 | Turns features into Playwright tests | Built for browser journeys; too heavy for entry-point scenarios |

**GYOS's choice:** `@cucumber/cucumber` 13 for module scenarios. It is the official runner, it
supports `Rule:` and tag expressions, and its HTML report doubles as living documentation.
quickpickle is the alternative if one Vitest runner matters more than those features. That choice
is recorded as an ADR.
