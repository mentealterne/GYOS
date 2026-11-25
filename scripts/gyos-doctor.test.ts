/**
 * The doctor against a small product built in a temp dir: a conformant one must pass, and each
 * kind of breakage must be reported. Run: node --test scripts/*.test.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { diagnose, frontmatter, parseDecisions, vocabulary, type Finding } from "./gyos-doctor.ts";

const SKILL = `---
name: billing
description: >
  Owns the billing context of Acme: invoices and credit notes. Use it whenever work touches
  billing: "why was this invoice issued twice?".
when_to_use: >
  Vocabulary: invoice, credit note. Not for payments (payments).
metadata:
  gyos-standard: domain-skill/1
  module: "@module/billing"
---

# Billing

Owns invoices. See [the glossary](glossary.md).
`;

const ARCHITECTURE = `# Architecture: billing

- **C1. An issued invoice never changes amount.** _Trap:_ the accountant's totals drift.
- **C2. A credit note refers to an invoice.** _Trap:_ orphan credits.

**The trace,** from the outside in:

\`\`\`
route → billingController.issue → invoices/services/issue-invoice.ts
\`\`\`
`;

const DECISIONS = `# Decisions: billing

## Active

| Id | Date | Decision |
| --- | --- | --- |
| ADR-0001 | 2026-11-25 | Stack ([ADR](../../../../docs/decisions/0001-stack.md)) |
| billing-D1 | 2026-11-25 | Issued invoices are immutable |

---

## Log

### billing-D1 — Issued invoices are immutable (2026-11-25)

Status: accepted · supersedes: — · superseded by: —

In the context of invoicing, we decided for credit notes.

Confirmation: scenario: "A correction produces a credit note"; invariant: C1; invariant: M7
`;

const FEATURE = `Feature: Corrections

  Scenario: A correction produces a credit note
    Given an issued invoice
    When it is corrected
    Then a credit note is issued
`;

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function conformantProduct(root: string): void {
  const skill = ".claude/skills/billing";
  write(root, `${skill}/SKILL.md`, SKILL);
  write(root, `${skill}/glossary.md`, "# Glossary\n\n| Invoice | … |\n| Credit note | … |\n");
  write(root, `${skill}/architecture.md`, ARCHITECTURE);
  write(root, `${skill}/workflow.md`, "# Workflow\n");
  write(root, `${skill}/testing.md`, "# Testing\n");
  write(root, `${skill}/scenarios.md`, "# Scenarios\n\n- corrections.feature: corrections\n");
  write(root, `${skill}/development/decisions.md`, DECISIONS);
  write(root, `${skill}/development/todo.md`, "# Deferred work\n");
  write(root, "modules/billing/package.json", '{ "name": "@module/billing" }\n');
  write(root, "modules/billing/features/corrections.feature", FEATURE);
  write(root, "modules/billing/src/invoices/services/issue-invoice.ts", "export {};\n");
  write(root, "docs/decisions/0001-stack.md", "# ADR-0001 — Stack (2026-11-25)\n\nConfirmation: invariant: M7\n");
  write(root, "docs/standards/module.md", "**M7. The module owns its schema.**\n");
}

const failures = (findings: Finding[]) => findings.filter((finding) => finding.level === "fail");

describe("gyos-doctor", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gyos-doctor-"));
    conformantProduct(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("passes a conformant product", () => {
    assert.deepEqual(failures(diagnose(root)), []);
  });

  const breakages: Array<[string, () => void, RegExp]> = [
    ["a missing required file", () => rmSync(join(root, ".claude/skills/billing/testing.md")), /required file is missing/],
    ["an unfilled slot", () => write(root, ".claude/skills/billing/workflow.md", "Clarify {{dimensions}}\n"), /unfilled/],
    ["a generator instruction left behind", () => write(root, ".claude/skills/billing/testing.md", "<!-- gyos: remove me -->\n"), /generator instruction/],
    ["a vocabulary term missing from the glossary", () => write(root, ".claude/skills/billing/glossary.md", "| Invoice | … |\n"), /"credit note" is not in glossary/],
    ["a forbidden frontmatter field", () => write(root, ".claude/skills/billing/SKILL.md", SKILL.replace("metadata:", "paths: modules/**\nmetadata:")), /"paths" is forbidden/],
    ["a duplicated invariant number", () => write(root, ".claude/skills/billing/architecture.md", `${ARCHITECTURE}\n- **C2. Again.**\n`), /C2 is defined twice/],
    ["a Confirmation naming a missing scenario", () => write(root, ".claude/skills/billing/development/decisions.md", DECISIONS.replace("A correction produces", "A refund produces")), /no scenario named/],
    ["a Confirmation naming a missing invariant", () => write(root, ".claude/skills/billing/development/decisions.md", DECISIONS.replace("invariant: C1", "invariant: C9")), /no invariant C9/],
    ["a superseded decision still active", () => write(root, ".claude/skills/billing/development/decisions.md", DECISIONS.replace("superseded by: —", "superseded by: billing-D2")), /billing-D1 is superseded/],
    ["an active ADR with no file", () => rmSync(join(root, "docs/decisions/0001-stack.md")), /ADR-0001 has no file/],
    ["a feature file missing from scenarios.md", () => write(root, "modules/billing/features/refunds.feature", "Feature: Refunds\n"), /doesn't index refunds.feature/],
    ["a module without a skill", () => write(root, "modules/payments/package.json", '{ "name": "@module/payments" }\n'), /module "payments" has no domain skill/],
    ["a broken relative link", () => write(root, ".claude/skills/billing/workflow.md", "See [x](missing.md).\n"), /broken link/],
    ["a reference to the plugin root", () => write(root, ".claude/skills/billing/workflow.md", "Read ${CLAUDE_PLUGIN_ROOT}/x.md\n"), /CLAUDE_PLUGIN_ROOT/],
    ["a file at twice its ceiling", () => write(root, ".claude/skills/billing/workflow.md", "line\n".repeat(400)), /twice its ceiling/],
  ];

  for (const [name, breakIt, expected] of breakages) {
    it(`reports ${name}`, () => {
      breakIt();
      const messages = failures(diagnose(root)).map((finding) => finding.message);
      assert.ok(
        messages.some((message) => expected.test(message)),
        `expected a failure matching ${expected}, got:\n${messages.join("\n") || "(none)"}`,
      );
    });
  }

  it("warns, without failing, on a trace naming a file that doesn't exist", () => {
    write(root, ".claude/skills/billing/architecture.md", ARCHITECTURE.replace("issue-invoice.ts", "missing.ts"));
    const findings = diagnose(root);
    assert.deepEqual(failures(findings), []);
    assert.ok(findings.some((finding) => finding.level === "warn" && /trace names/.test(finding.message)));
  });

  it("lists Unverified markers as notes", () => {
    write(root, ".claude/skills/billing/workflow.md", "Unverified: confirm the trace.\n");
    assert.ok(diagnose(root).some((finding) => finding.level === "note" && /Unverified/.test(finding.message)));
  });
});

describe("gyos-doctor parsers", () => {
  it("reads folded frontmatter values and nested metadata", () => {
    const fields = frontmatter(SKILL);
    assert.equal(fields?.get("name"), "billing");
    assert.match(fields?.get("description") ?? "", /^Owns the billing context/);
    assert.equal(fields?.get("metadata.gyos-standard"), "domain-skill/1");
  });

  it("reads the vocabulary list up to the full stop", () => {
    assert.deepEqual(vocabulary("Vocabulary: invoice, credit note. Not for payments."), ["invoice", "credit note"]);
  });

  it("reads active ids, log ids and superseded entries", () => {
    const decisions = parseDecisions(DECISIONS.replace("superseded by: —", "superseded by: billing-D2"));
    assert.deepEqual(decisions.activeIds, ["ADR-0001", "billing-D1"]);
    assert.deepEqual(decisions.logIds, ["billing-D1"]);
    assert.ok(decisions.superseded.has("billing-D1"));
  });
});
