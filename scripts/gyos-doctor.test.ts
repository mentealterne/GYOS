/**
 * The doctor against small products built in a temp dir: a conformant one must pass, each kind
 * of breakage must be reported, and GYOS's own templates, once filled, must pass too.
 * Run: node --test scripts/*.test.ts
 */
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  coreTerms,
  diagnose,
  frontmatter,
  parseDecisions,
  readsTenantFromHeader,
  vocabulary,
  type Finding,
} from "./gyos-doctor.ts";

const TEMPLATES = join(import.meta.dirname, "..", "templates");

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

| When | Load | About |
| --- | --- | --- |
| Always | glossary.md | 30 tokens |
`;

const GLOSSARY = `# Glossary

## Core terms

| Term (business language) | In code | Meaning here | Codified in | Banned synonyms |
| --- | --- | --- | --- | --- |
| Invoice | \`Invoice\` | A bill | — | bill |
| Credit note | \`CreditNote\` | A correction | — | refund slip |
`;

const ARCHITECTURE = `# Architecture: billing

The module follows [docs/standards/module.md](../../../docs/standards/module.md).

- **C1. An issued invoice never changes amount.** _Trap:_ the accountant's totals drift.
- **C2. A credit note refers to an invoice.** _Trap:_ orphan credits.

**The trace,** from the outside in:

\`\`\`
route → billingController.issue → invoices/services/issue-invoice.ts
\`\`\`
`;

const WORKFLOW = `# Workflow

## Inquiry

Answer and cite. **An Inquiry can stop reading here.**

## The five rules

**1. Clarify.** **2. Confront.** **3. Pin.** **4. Defer.** **5. Record.**

## Change

Steps.

| Kind of knowledge | Goes to | Because |
| --- | --- | --- |

| File | Ceiling | At the ceiling |
| --- | --- | --- |
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

const ADR = `# ADR-0001 — Stack (2026-11-25)

Status: accepted · supersedes: — · superseded by: —

Confirmation: invariant: M7
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
  write(root, `${skill}/glossary.md`, GLOSSARY);
  write(root, `${skill}/architecture.md`, ARCHITECTURE);
  write(root, `${skill}/workflow.md`, WORKFLOW);
  write(root, `${skill}/testing.md`, "# Testing\n");
  write(root, `${skill}/scenarios.md`, "# Scenarios\n\n- corrections.feature: corrections\n");
  write(root, `${skill}/development/decisions.md`, DECISIONS);
  write(root, `${skill}/development/todo.md`, "# Deferred work\n");
  write(root, "modules/billing/package.json", '{ "name": "@module/billing" }\n');
  write(root, "modules/billing/features/corrections.feature", FEATURE);
  write(root, "modules/billing/src/invoices/services/issue-invoice.ts", "export {};\n");
  write(root, "docs/decisions/0001-stack.md", ADR);
  write(root, "docs/standards/module.md", "**M7. The module owns its schema.**\n");
  write(root, "docs/standards/domain-skill.md", "# Standard: domain skill\n");
}

const failures = (findings: Finding[]) => findings.filter((finding) => finding.level === "fail");
const at = (path: string) => `.claude/skills/billing/${path}`;

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

  it("passes the same product with CRLF line endings and a BOM", () => {
    for (const path of [at("SKILL.md"), at("development/decisions.md")]) {
      const text = readFileSync(join(root, path), "utf8");
      writeFileSync(join(root, path), `﻿${text.replace(/\n/g, "\r\n")}`);
    }
    assert.deepEqual(failures(diagnose(root)), []);
  });

  it("fails on a folder that isn't a GYOS product", () => {
    const empty = mkdtempSync(join(tmpdir(), "gyos-doctor-empty-"));
    try {
      assert.ok(failures(diagnose(empty)).some((finding) => /no GYOS domain skill/.test(finding.message)));
      assert.ok(failures(diagnose(join(empty, "nope"))).some((finding) => /not a directory/.test(finding.message)));
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  const breakages: Array<[string, () => void, RegExp]> = [
    ["a missing required file", () => rmSync(join(root, at("testing.md"))), /required file is missing/],
    ["an unfilled slot", () => write(root, at("testing.md"), "Clarify {{dimensions}}\n"), /unfilled/],
    ["a generator instruction left behind", () => write(root, at("testing.md"), "<!-- gyos: remove me -->\n"), /generator instruction/],
    ["a vocabulary term missing from the glossary", () => write(root, at("glossary.md"), GLOSSARY.replace(/\| Credit note .*\n/, "")), /"credit note" is not a core term/],
    ["a vocabulary term found only among banned synonyms", () => write(root, at("glossary.md"), GLOSSARY.replace("| Credit note |", "| Correction slip |").replace("refund slip", "credit note")), /"credit note" is not a core term/],
    ["an unknown standard version", () => write(root, at("SKILL.md"), SKILL.replace("domain-skill/1", "whatever")), /gyos-standard is "whatever"/],
    ["a forbidden frontmatter field", () => write(root, at("SKILL.md"), SKILL.replace("metadata:", "paths: modules/**\nmetadata:")), /"paths" is forbidden/],
    ["a duplicated invariant number", () => write(root, at("architecture.md"), `${ARCHITECTURE}\n- **C2. Again.** _Trap:_ x.\n`), /C2 is defined twice/],
    ["an invariant without a trap", () => write(root, at("architecture.md"), `${ARCHITECTURE}\n- **C3. No trap here.**\n`), /C3 has no trap/],
    ["an architecture without the module standard", () => write(root, at("architecture.md"), ARCHITECTURE.replace(/The module follows.*\n/, "")), /doesn't link docs\/standards\/module\.md/],
    ["a trace naming a missing file, unmarked", () => write(root, at("architecture.md"), ARCHITECTURE.replace("issue-invoice.ts", "missing.ts")), /the trace names .*missing\.ts/],
    ["a workflow without its stop marker", () => write(root, at("workflow.md"), WORKFLOW.replace("**An Inquiry can stop reading here.**", "")), /stop reading/],
    ["a workflow with Change before Inquiry", () => write(root, at("workflow.md"), "## Change\n\n## Inquiry\nAn Inquiry can stop reading here. **1. ** **2. ** **3. ** **4. ** **5. **\n| Kind of knowledge |\n| File | Ceiling |\n"), /must come before/],
    ["a Confirmation naming a missing scenario", () => write(root, at("development/decisions.md"), DECISIONS.replace("A correction produces", "A refund produces")), /no scenario named/],
    ["a bold Confirmation naming a missing scenario", () => write(root, at("development/decisions.md"), DECISIONS.replace("Confirmation: scenario: \"A correction produces", "**Confirmation:** scenario: \"A refund produces")), /no scenario named/],
    ["an empty Confirmation", () => write(root, at("development/decisions.md"), DECISIONS.replace(/Confirmation: .*/, "Confirmation:")), /Confirmation is empty/],
    ["an entry with no Confirmation", () => write(root, at("development/decisions.md"), DECISIONS.replace(/Confirmation: .*\n/, "")), /has 0 Confirmation lines/],
    ["a Confirmation hiding a bogus part behind Unverified", () => write(root, at("development/decisions.md"), DECISIONS.replace("invariant: C1;", "invariant: C9; Unverified: later;")), /no invariant C9/],
    ["a Confirmation naming a missing invariant", () => write(root, at("development/decisions.md"), DECISIONS.replace("invariant: C1", "invariant: C9")), /no invariant C9/],
    ["a test Confirmation pointing at a folder", () => write(root, at("development/decisions.md"), DECISIONS.replace("invariant: C1", 'test: modules "x"')), /no test file modules/],
    ["a superseded decision still active", () => write(root, at("development/decisions.md"), DECISIONS.replace("superseded by: —", "superseded by: billing-D2")), /billing-D1 is superseded/],
    ["a log heading it can't parse", () => write(root, at("development/decisions.md"), `${DECISIONS}\n### A note\n`), /a log heading that isn't/],
    ["an active ADR with no file", () => rmSync(join(root, "docs/decisions/0001-stack.md")), /ADR-0001 has no file/],
    ["a superseded ADR still active", () => write(root, "docs/decisions/0001-stack.md", ADR.replace("superseded by: —", "superseded by: ADR-0002")), /active ADR-0001 is superseded/],
    ["two ADRs with the same number", () => write(root, "docs/decisions/0001-other.md", ADR), /ADR number 0001 is also used/],
    ["an ADR whose title disagrees with its file", () => write(root, "docs/decisions/0001-stack.md", ADR.replace("ADR-0001", "ADR-0007")), /title says ADR-0007/],
    ["an archive that isn't linked", () => write(root, at("development/decisions-archive.md"), "# Archive\n"), /isn't linked at the top/],
    ["a feature file missing from scenarios.md", () => write(root, "modules/billing/features/refunds.feature", "Feature: Refunds\n"), /doesn't index refunds.feature/],
    ["a module without a skill", () => write(root, "modules/payments/package.json", '{ "name": "@module/payments" }\n'), /module "payments" has no domain skill/],
    ["a broken relative link", () => write(root, at("testing.md"), "See [x](missing.md).\n"), /broken link/],
    ["a link outside the repo", () => write(root, at("testing.md"), "See [x](../../../../../etc/hosts).\n"), /outside the repo/],
    ["a link that isn't a valid URI", () => write(root, at("testing.md"), "See [x](a%zz.md).\n"), /isn't a valid URI/],
    ["a reference to the plugin root", () => write(root, at("testing.md"), "Read ${CLAUDE_PLUGIN_ROOT}/x.md\n"), /CLAUDE_PLUGIN_ROOT/],
    ["a file at twice its ceiling", () => write(root, at("testing.md"), "line\n".repeat(500)), /twice its ceiling/],
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

  it("only notes a missing trace file when the trace is marked unverified", () => {
    write(root, at("architecture.md"), `${ARCHITECTURE.replace("issue-invoice.ts", "missing.ts")}\nUnverified: the trace hasn't been checked.\n`);
    const findings = diagnose(root);
    assert.deepEqual(failures(findings), []);
    assert.ok(findings.some((finding) => finding.level === "note" && /trace names/.test(finding.message)));
  });

  it("doesn't take the GYOS header's date for a decision in the contract", () => {
    write(root, at("architecture.md"), `<!-- Generated by GYOS 0.3.0 on 2026-11-25 from templates/skill. -->\n\n${ARCHITECTURE}`);
    assert.ok(!diagnose(root).some((finding) => /contains a date/.test(finding.message)));
    write(root, at("architecture.md"), `${ARCHITECTURE}\nDecided on 2026-11-25.\n`);
    assert.ok(diagnose(root).some((finding) => /contains a date/.test(finding.message)));
  });

  it("joins a Confirmation wrapped over two lines", () => {
    write(root, at("development/decisions.md"), DECISIONS.replace("; invariant: C1; invariant: M7", ";\n  invariant: C1; invariant: M7"));
    assert.deepEqual(failures(diagnose(root)), []);
  });

  it("accepts an en dash or a hyphen in a log heading", () => {
    write(root, at("development/decisions.md"), DECISIONS.replace("billing-D1 —", "billing-D1 -"));
    assert.deepEqual(failures(diagnose(root)), []);
  });

  it("warns, without failing, while the host takes the tenant from a header", () => {
    const placeholder = readFileSync(join(TEMPLATES, "apps", "api", "src", "http", "tenant.ts"), "utf8");
    write(root, "apps/api/src/http/tenant.ts", placeholder);
    const findings = diagnose(root);
    assert.deepEqual(failures(findings), []);
    assert.ok(
      findings.some(
        (finding) =>
          finding.level === "warn" && finding.file === "apps/api/src/http/tenant.ts" && /not authentication/.test(finding.message),
      ),
    );
  });

  it("says nothing about the tenant once it comes from the session", () => {
    write(
      root,
      "apps/api/src/http/tenant.ts",
      "// It used to be request.get(TENANT_HEADER), the x-tenant-id header.\nexport const tenantOf = (request) => request.session.tenantId;\n",
    );
    assert.ok(!diagnose(root).some((finding) => /x-tenant-id/.test(finding.message)));
  });

  it("warns when the load plan's token counts are far from the measured ones", () => {
    write(root, at("SKILL.md"), SKILL.replace("30 tokens", "9000 tokens"));
    assert.ok(diagnose(root).some((finding) => finding.level === "warn" && /load plan states/.test(finding.message)));
  });
});

/** Every file under a directory, relative to it. */
function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, `${prefix}${name}/`) : [`${prefix}${name}`];
  });
}

/** The skill and decision templates, filled mechanically, the way /gyos:init fills them. */
function fill(text: string): string {
  return text
    .replace(/<!-- gyos:[\s\S]*?-->\n?/g, "")
    .replace(/^Confirmation: \{\{[^}]*\}\}.*$/gm, "Confirmation: Unverified: to be added")
    .replace(/\{\{context\}\}/g, "billing")
    .replace(/\{\{Context\}\}/g, "Billing")
    .replace(/\{\{gyos-version\}\}/g, "0.0.0")
    .replace(/\{\{date\}\}/g, "2026-11-25")
    .replace(/\{\{n\}\}/g, "100")
    .replace(/\{\{NNNN\}\}/g, "0005")
    .replace(/\{\{[^}]*\}\}/g, "filled");
}

describe("gyos-doctor on GYOS's own templates", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gyos-doctor-templates-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("fails on the unfilled templates", () => {
    cpSync(join(TEMPLATES, "skill"), join(root, ".claude/skills/billing"), { recursive: true });
    write(root, "docs/standards/domain-skill.md", "# Standard\n");
    const messages = failures(diagnose(root)).map((finding) => finding.message);
    assert.ok(messages.some((message) => /unfilled/.test(message)));
    assert.ok(messages.some((message) => /generator instruction/.test(message)));
  });

  it("passes on the templates once filled", () => {
    for (const file of walk(join(TEMPLATES, "skill"))) {
      write(root, `.claude/skills/billing/${file}`, fill(readFileSync(join(TEMPLATES, "skill", file), "utf8")));
    }
    for (const file of walk(join(TEMPLATES, "docs", "decisions"))) {
      if (file === "junction.md") continue;
      write(root, `docs/decisions/${file}`, fill(readFileSync(join(TEMPLATES, "docs", "decisions", file), "utf8")));
    }
    // What the filled links point at in a real product.
    write(root, "modules/billing/package.json", '{ "name": "@module/billing" }\n');
    write(root, "modules/billing/src/contracts.ts", "export {};\n");
    write(root, "modules/billing/src/module-controllers/index.ts", "export {};\n");
    write(root, "modules/billing/src/filled", "\n");
    write(root, "modules/billing/features/filled.feature", "Feature: Filled\n");
    write(root, "docs/context-map.md", "# Context map\n");
    write(root, "docs/standards/module.md", "**M4. Injected.**\n**M7. Schema.**\n**M10. One way.**\n");
    write(root, "docs/standards/domain-skill.md", "# Standard\n");
    write(root, "apps/api/src/logger.ts", "export {};\n");
    const messages = failures(diagnose(root)).map((finding) => `${finding.file}: ${finding.message}`);
    assert.deepEqual(messages, []);
  });
});

describe("gyos-doctor parsers", () => {
  it("reads folded and literal frontmatter values and nested metadata", () => {
    const fields = frontmatter(SKILL);
    assert.equal(fields?.get("name"), "billing");
    assert.match(fields?.get("description") ?? "", /^Owns the billing context/);
    assert.equal(fields?.get("metadata.gyos-standard"), "domain-skill/1");
    assert.match(frontmatter(SKILL.replace("description: >", "description: |-"))?.get("description") ?? "", /^Owns/);
  });

  it("reads the vocabulary list up to the full stop, or the end", () => {
    assert.deepEqual(vocabulary("Vocabulary: invoice, credit note. Not for payments."), ["invoice", "credit note"]);
    assert.deepEqual(vocabulary("Vocabulary: invoice, credit note"), ["invoice", "credit note"]);
  });

  it("reads the glossary's core terms from the first column only", () => {
    assert.deepEqual([...coreTerms(GLOSSARY)], ["invoice", "credit note"]);
  });

  it("recognises a tenant read from the x-tenant-id header, not any header", () => {
    for (const code of [
      "request.get(TENANT_HEADER)",
      'request.get("x-tenant-id")',
      "req.header('X-Tenant-Id')",
      'request.headers["x-tenant-id"]',
      "request.headers[ TENANT_HEADER ]",
    ]) {
      assert.equal(readsTenantFromHeader(`const tenantId = ${code};`), true, code);
    }
    for (const code of ['request.get("authorization")', "// request.get(TENANT_HEADER)", "/* headers['x-tenant-id'] */"]) {
      assert.equal(readsTenantFromHeader(`const value = 1; ${code}`), false, code);
    }
  });

  it("reads active ids, log entries and superseded entries", () => {
    const decisions = parseDecisions(DECISIONS.replace("superseded by: —", "superseded by: billing-D2"));
    assert.deepEqual(decisions.activeIds, ["ADR-0001", "billing-D1"]);
    assert.deepEqual(decisions.entries.map((entry) => entry.id), ["billing-D1"]);
    assert.equal(decisions.entries[0].supersededBy, "billing-D2");
  });
});
