/**
 * copy-standards: stripping, refusal, idempotence, and the plugin-only leak check.
 * Run: node --test scripts/*.test.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { pluginOnlyLeftovers, stripGyosOnly } from "./copy-standards.ts";

describe("stripGyosOnly", () => {
  it("drops every marked region and keeps the rest", () => {
    const text = "keep 1\n<!-- gyos-only:start -->\ndrop\n<!-- gyos-only:end -->\nkeep 2\n";
    assert.equal(stripGyosOnly(text, "x"), "keep 1\nkeep 2\n");
  });

  it("refuses unbalanced markers", () => {
    assert.throws(() => stripGyosOnly("<!-- gyos-only:start -->\n", "x"), /never closed/);
    assert.throws(() => stripGyosOnly("<!-- gyos-only:end -->\n", "x"), /without a start/);
    assert.throws(() => stripGyosOnly("<!-- gyos-only:start -->\n<!-- gyos-only:start -->\n", "x"), /nested/);
  });
});

describe("pluginOnlyLeftovers", () => {
  it("finds references to files only the plugin has", () => {
    const text = "see `knowledge/data-and-migrations.md`\nrun scripts/verify-templates.ts\nfine: scripts/migrate.ts\n";
    assert.deepEqual(pluginOnlyLeftovers(text).map((line) => line.split(":")[0]), ["1", "2"]);
  });
});

describe("the real standards", () => {
  for (const name of ["module.md", "host.md", "domain-skill.md"]) {
    it(`${name} strips cleanly and leaves no plugin-only reference`, () => {
      const text = readFileSync(join(import.meta.dirname, "..", "standards", name), "utf8");
      assert.deepEqual(pluginOnlyLeftovers(stripGyosOnly(text, name)), []);
    });
  }

  it("keeps the product-facing rules of the domain skill standard and drops GYOS's own", () => {
    const text = readFileSync(join(import.meta.dirname, "..", "standards", "domain-skill.md"), "utf8");
    const stripped = stripGyosOnly(text, "domain-skill.md");
    assert.match(stripped, /## Never invent, and mark what isn't checked/);
    assert.doesNotMatch(stripped, /How GYOS fills a new skill/);
  });
});

describe("copyStandards", () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "copy-standards-"));
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("writes the three standards, each with its header", async () => {
    const { copyStandards } = await import("./copy-standards.ts");
    const { written } = copyStandards(repo, "0.0.0", "2026-01-01");
    assert.equal(written.length, 3);
    for (const name of ["module.md", "host.md", "domain-skill.md"]) {
      assert.match(readFileSync(join(repo, "docs", "standards", name), "utf8"), /^<!-- Copied from GYOS 0\.0\.0 /);
    }
  });

  it("leaves an unchanged copy alone, date included", async () => {
    const { copyStandards } = await import("./copy-standards.ts");
    copyStandards(repo, "0.0.0", "2026-01-01");
    const { written } = copyStandards(repo, "0.0.0", "2026-02-02");
    assert.deepEqual(written, []);
  });

  it("never overwrites a file GYOS didn't write", async () => {
    const { copyStandards } = await import("./copy-standards.ts");
    mkdirSync(join(repo, "docs", "standards"), { recursive: true });
    writeFileSync(join(repo, "docs", "standards", "domain-skill.md"), "the team's own\n");
    const { refused } = copyStandards(repo, "0.0.0", "2026-01-01");
    assert.ok(refused.some((file) => file.endsWith("domain-skill.md")));
    assert.equal(readFileSync(join(repo, "docs", "standards", "domain-skill.md"), "utf8"), "the team's own\n");
  });
});
