/**
 * GYOS doctor: checks that a product's domain skills and decisions are still in the shape
 * docs/standards/domain-skill.md describes. It is copied into every product GYOS sets up, runs in
 * its CI, and needs nothing but Node 24.
 *
 * Run from the product root:   node scripts/gyos-doctor.ts [<product-root>] [--json]
 * Exit code: 1 if any check fails, 0 otherwise. Warnings and notes never fail the run.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Bumped with every change to the checks; /gyos:doctor compares a product's copy with the plugin's. */
export const DOCTOR_VERSION = "3";

export type Level = "fail" | "warn" | "note";

export interface Finding {
  level: Level;
  file: string;
  message: string;
}

const KNOWN_STANDARDS = new Set(["domain-skill/1"]);

const REQUIRED_FILES = [
  "SKILL.md",
  "glossary.md",
  "architecture.md",
  "workflow.md",
  "testing.md",
  "development/decisions.md",
  "development/todo.md",
];

/** Line ceilings per file, from the standard. Over: a warning. At twice: a failure. */
const CEILINGS: Record<string, number> = {
  "SKILL.md": 150,
  "glossary.md": 200,
  "architecture.md": 200,
  "workflow.md": 200,
  "testing.md": 250,
  "scenarios.md": 250,
  "state-of-the-code.md": 250,
  "guardrails.md": 250,
  "development/todo.md": 150,
  "development/qa-checklist.md": 400,
};
const ACTIVE_ROWS_CEILING = 50;
const LOG_LINES_CEILING = 400;
const ACTIVATION_LIMIT = 1536;

const RESERVED_NAMES = new Set([
  // GYOS's own skills
  "init", "discover", "context", "feature", "decide", "doctor", "adopt", "split", "merge", "upgrade",
  // Claude Code built-in commands (domain-skill/1 list)
  "add-dir", "agents", "bug", "clear", "compact", "config", "cost", "exit", "export", "help",
  "hooks", "login", "logout", "mcp", "memory", "model", "permissions", "plugin", "pr-comments",
  "release-notes", "resume", "review", "rewind", "security-review", "status", "statusline",
  "terminal-setup", "todos", "usage", "vim",
]);

const SKIPPED_DIRS = new Set(["node_modules", "dist", ".git", ".turbo", "coverage", "reports"]);

const ENTRY_HEADING = /^###\s+(\S+)\s+[—–-]\s+/;
const ADR_HEADING = /^#\s+(ADR-\d{4})\s+[—–-]\s+/;

// ---------------------------------------------------------------------------------------------
// Small helpers

/** A text file, with a BOM dropped and CRLF line endings turned into LF. */
function read(path: string): string {
  return readFileSync(path, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

function filesUnder(dir: string, suffix: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIPPED_DIRS.has(name)) return [];
    if (statSync(path).isDirectory()) return filesUnder(path, suffix);
    return name.endsWith(suffix) ? [path] : [];
  });
}

function lineCount(text: string): number {
  return text.replace(/\n$/, "").split("\n").length;
}

/** The lines outside fenced code blocks; inline code is kept or removed on request. */
function linesOutsideFences(text: string, keepInlineCode: boolean): string[] {
  let isInFence = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      isInFence = !isInFence;
      return "";
    }
    if (isInFence) return "";
    return keepInlineCode ? line : line.replace(/`[^`]*`/g, "");
  });
}

/** GitHub's anchor for a heading. */
function slug(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

const anchorCache = new Map<string, Set<string>>();
function anchorsOf(file: string): Set<string> {
  const cached = anchorCache.get(file);
  if (cached) return cached;
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of linesOutsideFences(read(file), true)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  anchorCache.set(file, anchors);
  return anchors;
}

/**
 * Whether the host's tenant.ts reads the tenant from a request header: the x-tenant-id placeholder
 * GYOS's host template ships, named or through its TENANT_HEADER constant, outside comments.
 */
export function readsTenantFromHeader(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return /(?:\b(?:get|header)\(|\bheaders\s*\[)\s*(?:TENANT_HEADER\b|["'`]x-tenant-id["'`])/i.test(code);
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The skill's frontmatter: top-level keys, folded values joined, nested keys flattened. */
export function frontmatter(text: string): Map<string, string> | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = new Map<string, string>();
  let current: string | null = null;
  for (const line of match[1].split("\n")) {
    const top = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (top) {
      current = top[1];
      const value = top[2].trim();
      fields.set(current, /^[>|][+-]?$/.test(value) ? "" : value.replace(/^["']|["']$/g, ""));
      continue;
    }
    const nested = /^\s+([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (nested && current === "metadata") {
      fields.set(`metadata.${nested[1]}`, nested[2].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    if (current && /^\s+\S/.test(line)) {
      const previous = fields.get(current) ?? "";
      fields.set(current, `${previous} ${line.trim()}`.trim());
    }
  }
  return fields;
}

/** The terms listed after "Vocabulary:", up to a full stop or the end of the text. */
export function vocabulary(text: string): string[] {
  const match = /Vocabulary:\s*([^.]*)(?:\.|$)/i.exec(text);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((term) => term.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter((term) => term.length > 0);
}

/** The first column of the glossary's "Core terms" table, lowercased. */
export function coreTerms(glossary: string): Set<string> {
  const terms = new Set<string>();
  const lines = glossary.split("\n");
  const start = lines.findIndex((line) => /^##\s+Core terms\b/i.test(line));
  if (start < 0) return terms;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
    if (cells.length < 3 || /^:?-+:?$/.test(cells[1]) || /^Term\b/i.test(cells[1])) continue;
    terms.add(cells[1].replace(/[`*]/g, "").toLowerCase());
  }
  return terms;
}

export interface Entry {
  id: string;
  line: number;
  supersededBy: string | null;
  confirmations: Array<{ line: number; value: string }>;
}

interface Decisions {
  activeIds: string[];
  activeRows: number;
  logLines: number;
  entries: Entry[];
  badHeadings: number[];
  archiveLinked: boolean;
}

/** The status line's "superseded by", or null when it says the entry still holds. */
function supersededBy(line: string): string | null {
  const by = /superseded by:\s*([^\s·]+)/i.exec(line);
  return by && !["—", "–", "-"].includes(by[1]) ? by[1] : null;
}

/** "Confirmation:" values in a block of lines, joined across wrapped lines. */
function confirmations(lines: string[], offset: number): Array<{ line: number; value: string }> {
  const found: Array<{ line: number; value: string }> = [];
  for (let index = 0; index < lines.length; index++) {
    const match = /^\s*(?:\*\*)?Confirmation:(?:\*\*)?\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    let value = match[1];
    while (
      index + 1 < lines.length &&
      lines[index + 1].trim() !== "" &&
      !/^\s*(?:\*\*)?[A-Z][\w ]*:/.test(lines[index + 1]) &&
      !/^#/.test(lines[index + 1])
    ) {
      index++;
      value += ` ${lines[index].trim()}`;
    }
    found.push({ line: offset + index + 1, value: value.trim() });
  }
  return found;
}

export function parseDecisions(text: string): Decisions {
  const lines = text.split("\n");
  const activeStart = lines.findIndex((line) => /^##\s+Active\b/.test(line));
  const logStart = lines.findIndex((line) => /^##\s+Log\b/.test(line));
  const activeIds: string[] = [];
  if (activeStart >= 0) {
    for (const line of lines.slice(activeStart + 1, logStart >= 0 ? logStart : undefined)) {
      const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
      if (cells.length < 3 || /^:?-+:?$/.test(cells[1]) || cells[1] === "Id") continue;
      activeIds.push(cells[1]);
    }
  }
  const entries: Entry[] = [];
  const badHeadings: number[] = [];
  if (logStart >= 0) {
    let current: Entry | null = null;
    let blockStart = 0;
    const flush = (end: number) => {
      if (current) current.confirmations = confirmations(lines.slice(blockStart, end), blockStart);
    };
    for (let index = logStart + 1; index < lines.length; index++) {
      const line = lines[index];
      if (/^###\s/.test(line)) {
        flush(index);
        const heading = ENTRY_HEADING.exec(line);
        current = heading ? { id: heading[1], line: index + 1, supersededBy: null, confirmations: [] } : null;
        if (current) entries.push(current);
        else badHeadings.push(index + 1);
        blockStart = index + 1;
        continue;
      }
      if (current && /^Status:/i.test(line.trim())) current.supersededBy = supersededBy(line);
    }
    flush(lines.length);
  }
  return {
    activeIds,
    activeRows: activeIds.length,
    logLines: logStart >= 0 ? lines.length - logStart - 1 : 0,
    entries,
    badHeadings,
    archiveLinked: /\]\(decisions-archive\.md\)/.test(lines.slice(0, activeStart >= 0 ? activeStart : 10).join("\n")),
  };
}

/** The `C<n>` invariants an architecture.md defines, with the text of each bullet. */
export function invariants(text: string): Array<{ number: number; text: string }> {
  const found: Array<{ number: number; text: string }> = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const match = /\*\*C(\d+)\./.exec(line);
    if (!match) return;
    let body = line;
    for (let next = index + 1; next < lines.length && /^\s+\S/.test(lines[next]); next++) body += ` ${lines[next].trim()}`;
    found.push({ number: Number(match[1]), text: body });
  });
  return found;
}

// ---------------------------------------------------------------------------------------------
// The checks

type Add = (level: Level, file: string, message: string) => void;

interface Context {
  root: string;
  add: Add;
  invariantsByContext: Map<string, Set<number>>;
  scenariosByContext: Map<string, Set<string>>;
  allScenarios: Set<string>;
  moduleInvariants: Set<number> | null;
}

export function diagnose(root: string): Finding[] {
  anchorCache.clear();
  const findings: Finding[] = [];
  const add: Add = (level, file, message) => findings.push({ level, file: relative(root, file) || ".", message });

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    add("fail", root, "not a directory");
    return findings;
  }

  const skillsDir = join(root, ".claude", "skills");
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((name) => {
        const skillFile = join(skillsDir, name, "SKILL.md");
        return existsSync(skillFile) && /gyos-standard:/.test(read(skillFile));
      })
    : [];

  if (skills.length === 0) {
    add("fail", skillsDir, "no GYOS domain skill found: is this a product set up with GYOS, and is the path right?");
  }
  if (!existsSync(join(root, "docs", "standards", "domain-skill.md"))) {
    add("fail", join(root, "docs", "standards", "domain-skill.md"), "missing: the standard the skills are checked against");
  }

  // Every module has a skill.
  const modulesDir = join(root, "modules");
  if (existsSync(modulesDir)) {
    for (const name of readdirSync(modulesDir)) {
      if (!existsSync(join(modulesDir, name, "package.json"))) continue;
      if (!skills.includes(name)) {
        add("fail", join(modulesDir, name), `module "${name}" has no domain skill in .claude/skills/${name}/`);
      }
    }
  }

  // The host's tenant placeholder: a warning, not a failure, because development needs it.
  const tenantFile = join(root, "apps", "api", "src", "http", "tenant.ts");
  if (existsSync(tenantFile) && readsTenantFromHeader(read(tenantFile))) {
    add(
      "warn",
      tenantFile,
      "the tenant of a request still comes from the x-tenant-id header, a development placeholder that is not " +
        "authentication: any caller can act for any tenant. Derive it from the authenticated session before production",
    );
  }

  // Built once: every context's invariants and scenario names.
  const invariantsByContext = new Map<string, Set<number>>();
  const scenariosByContext = new Map<string, Set<string>>();
  for (const name of skills) {
    const architecture = join(skillsDir, name, "architecture.md");
    if (existsSync(architecture)) invariantsByContext.set(name, new Set(invariants(read(architecture)).map((item) => item.number)));
  }
  const allScenarios = new Set<string>();
  if (existsSync(modulesDir)) {
    for (const name of readdirSync(modulesDir)) {
      const names = new Set(
        filesUnder(join(modulesDir, name, "features"), ".feature").flatMap((feature) =>
          read(feature)
            .split("\n")
            .map((line) => /^\s*(?:Scenario Outline|Scenario|Example):\s*(.+?)\s*$/.exec(line)?.[1])
            .filter((scenario): scenario is string => Boolean(scenario)),
        ),
      );
      scenariosByContext.set(name, names);
      for (const scenario of names) allScenarios.add(scenario);
    }
  }
  const moduleStandard = join(root, "docs", "standards", "module.md");
  const moduleInvariants = existsSync(moduleStandard)
    ? new Set([...read(moduleStandard).matchAll(/\*\*M(\d+)\./g)].map((match) => Number(match[1])))
    : null;

  const context: Context = { root, add, invariantsByContext, scenariosByContext, allScenarios, moduleInvariants };
  const supersededAdrs = checkProjectDecisions(context);
  for (const name of skills) checkSkill(context, name, supersededAdrs);
  return findings;
}

function checkSkill(ctx: Context, name: string, supersededAdrs: Set<string>): void {
  const { root, add } = ctx;
  const dir = join(root, ".claude", "skills", name);
  const at = (file: string) => join(dir, file);

  for (const file of REQUIRED_FILES) {
    if (!existsSync(at(file))) add("fail", at(file), "required file is missing");
  }

  // Frontmatter and activation.
  const skillText = existsSync(at("SKILL.md")) ? read(at("SKILL.md")) : "";
  const fields = frontmatter(skillText);
  if (!fields) {
    add("fail", at("SKILL.md"), "no frontmatter");
  } else {
    if (fields.get("name") !== name) add("fail", at("SKILL.md"), `name is "${fields.get("name")}", expected "${name}"`);
    if (RESERVED_NAMES.has(name)) add("fail", at("SKILL.md"), `"${name}" is a reserved name`);
    const standard = fields.get("metadata.gyos-standard") ?? "";
    if (!KNOWN_STANDARDS.has(standard)) add("fail", at("SKILL.md"), `metadata.gyos-standard is "${standard}", not one of ${[...KNOWN_STANDARDS].join(", ")}`);
    const description = fields.get("description") ?? "";
    const whenToUse = fields.get("when_to_use") ?? "";
    if (!description) add("fail", at("SKILL.md"), "description is empty");
    const length = description.length + whenToUse.length;
    if (length > ACTIVATION_LIMIT) {
      add("fail", at("SKILL.md"), `description + when_to_use is ${length} characters; the limit is ${ACTIVATION_LIMIT}`);
    }
    for (const forbidden of ["disable-model-invocation", "paths"]) {
      if (fields.has(forbidden)) add("fail", at("SKILL.md"), `"${forbidden}" is forbidden in a domain skill`);
    }
    const terms = vocabulary(`${description} ${whenToUse}`);
    if (terms.length === 0) {
      add("warn", at("SKILL.md"), 'no "Vocabulary:" list in the frontmatter: activation by domain relies on it');
    } else {
      const glossary = existsSync(at("glossary.md")) ? coreTerms(read(at("glossary.md"))) : new Set<string>();
      for (const term of terms) {
        if (!glossary.has(term.toLowerCase())) add("fail", at("SKILL.md"), `vocabulary term "${term}" is not a core term in glossary.md`);
      }
    }
  }

  // Every markdown file of the skill.
  for (const file of filesUnder(dir, ".md")) {
    const text = read(file);
    const short = relative(dir, file).split(sep).join("/");
    if (text.includes("{{")) add("fail", file, "an unfilled {{slot}} remains (write a literal double brace as \\{\\{)");
    if (text.includes("<!-- gyos:")) add("fail", file, "a <!-- gyos: … --> generator instruction remains");
    if (text.includes("${CLAUDE_PLUGIN_ROOT}")) add("fail", file, "${CLAUDE_PLUGIN_ROOT} doesn't exist in a product");
    const ceiling = CEILINGS[short];
    if (ceiling) {
      const lines = lineCount(text);
      if (lines >= 2 * ceiling) add("fail", file, `${lines} lines, twice its ceiling of ${ceiling}`);
      else if (lines > ceiling) add("warn", file, `${lines} lines, over its ceiling of ${ceiling}`);
    }
    text.split("\n").forEach((line, index) => {
      if (/^\s*(?:[-*|]\s*)?Unverified:/.test(line) || /\|\s*Unverified:/.test(line)) {
        add("note", file, `line ${index + 1}: ${line.trim().slice(0, 100)}`);
      }
    });
    checkLinks(root, file, add);
  }

  checkArchitecture(ctx, name, at("architecture.md"));
  checkWorkflow(at("workflow.md"), add);
  reportTokens(dir, skillText, add);

  // Decisions.
  if (existsSync(at("development/decisions.md"))) {
    const file = at("development/decisions.md");
    const decisions = parseDecisions(read(file));
    if (decisions.activeRows > 2 * ACTIVE_ROWS_CEILING) add("fail", file, `${decisions.activeRows} active rows, twice the ceiling`);
    else if (decisions.activeRows > ACTIVE_ROWS_CEILING) add("warn", file, `${decisions.activeRows} active rows, over the ceiling of ${ACTIVE_ROWS_CEILING}`);
    if (decisions.logLines > 2 * LOG_LINES_CEILING) add("fail", file, `the log is ${decisions.logLines} lines, twice the ceiling`);
    else if (decisions.logLines > LOG_LINES_CEILING) add("warn", file, `the log is ${decisions.logLines} lines; archive superseded entries older than 180 days`);
    if (existsSync(at("development/decisions-archive.md")) && !decisions.archiveLinked) {
      add("fail", file, "decisions-archive.md exists but isn't linked at the top");
    }
    for (const line of decisions.badHeadings) add("fail", file, `line ${line}: a log heading that isn't "### ${name}-D<n> — Title (date)"`);
    const ownId = new RegExp(`^${name}-D\\d+$`);
    const logIds = decisions.entries.map((entry) => entry.id);
    for (const id of new Set(logIds.filter((id, index) => logIds.indexOf(id) !== index))) add("fail", file, `log id ${id} is used twice`);
    for (const entry of decisions.entries) {
      if (!ownId.test(entry.id)) add("fail", file, `line ${entry.line}: log id ${entry.id} should look like ${name}-D<n>`);
      checkEntryConfirmations(ctx, file, entry, name);
    }
    for (const id of decisions.activeIds) {
      if (ownId.test(id)) {
        const entry = decisions.entries.find((item) => item.id === id);
        if (!entry) add("fail", file, `active ${id} has no entry in the log`);
        else if (entry.supersededBy) add("fail", file, `active ${id} is superseded by ${entry.supersededBy}; remove its row`);
      } else if (/^ADR-\d{4}$/.test(id)) {
        if (!adrFiles(root, id).length) add("fail", file, `active ${id} has no file in docs/decisions/`);
        if (supersededAdrs.has(id)) add("fail", file, `active ${id} is superseded; remove its row`);
      } else {
        add("fail", file, `active id "${id}" is neither ${name}-D<n> nor ADR-NNNN`);
      }
    }
  }

  // Every feature file is indexed in scenarios.md.
  const featuresDir = join(root, "modules", name, "features");
  const features = filesUnder(featuresDir, ".feature");
  if (features.length > 0) {
    if (!existsSync(at("scenarios.md"))) {
      add("fail", at("scenarios.md"), `missing, but modules/${name}/features has ${features.length} .feature files`);
    } else {
      const scenarios = read(at("scenarios.md"));
      for (const feature of features) {
        const file = relative(featuresDir, feature).split(sep).join("/");
        if (!scenarios.includes(file)) add("fail", at("scenarios.md"), `doesn't index ${file}`);
      }
    }
  }
}

function checkArchitecture(ctx: Context, name: string, file: string): void {
  const { root, add } = ctx;
  if (!existsSync(file)) return;
  const text = read(file);
  if (!/\]\([^)]*docs\/standards\/module\.md\)/.test(text)) add("fail", file, "doesn't link docs/standards/module.md");
  const items = invariants(text);
  const numbers = items.map((item) => item.number);
  for (const number of new Set(numbers.filter((n, index) => numbers.indexOf(n) !== index))) add("fail", file, `invariant C${number} is defined twice`);
  for (const item of items) {
    if (!/Trap:/i.test(item.text) && !/retired/i.test(item.text)) add("fail", file, `invariant C${item.number} has no trap`);
  }
  if (/\b20\d\d-\d\d-\d\d\b/.test(text)) add("warn", file, "contains a date: decisions belong in development/decisions.md, not in the contract");

  // The trace: every path in it exists, or the trace is marked unverified.
  const start = text.indexOf("The trace");
  if (start < 0) return;
  const after = text.slice(start);
  const block = /```[^\n]*\n([\s\S]*?)```/.exec(after);
  if (!block) return;
  const isUnverified = /^Unverified:/m.test(after.slice(block.index + block[0].length, block.index + block[0].length + 400));
  for (const [path] of block[1].matchAll(/[\w./-]+\.ts\b/g)) {
    const candidates = [join(root, path), join(root, "modules", name, "src", path), join(root, "modules", name, path)];
    if (candidates.some((candidate) => existsSync(candidate))) continue;
    add(isUnverified ? "note" : "fail", file, `the trace names ${path}, which doesn't exist${isUnverified ? " (the trace is marked unverified)" : ""}`);
  }
}

function checkWorkflow(file: string, add: Add): void {
  if (!existsSync(file)) return;
  const text = read(file);
  const inquiry = text.search(/^##\s+Inquiry\b/m);
  const change = text.search(/^##\s+Change\b/m);
  if (inquiry < 0 || change < 0) add("fail", file, 'needs an "## Inquiry" and a "## Change" section');
  else if (inquiry > change) add("fail", file, "the Inquiry track must come before the Change protocol");
  if (!/can stop reading here/i.test(text)) add("fail", file, "no marker where an Inquiry can stop reading");
  for (let rule = 1; rule <= 5; rule++) {
    if (!new RegExp(`\\*\\*${rule}\\. `).test(text)) add("fail", file, `mandatory rule ${rule} is missing`);
  }
  if (!/\|\s*Kind of knowledge\s*\|/.test(text)) add("fail", file, "the filing table is missing");
  if (!/\|\s*File\s*\|\s*Ceiling\s*\|/.test(text)) add("fail", file, "the ceilings table is missing");
}

/** Measured token costs (characters ÷ 4) next to the ones SKILL.md states. */
function reportTokens(dir: string, skillText: string, add: Add): void {
  const size = (file: string) => (existsSync(join(dir, file)) ? Math.round(read(join(dir, file)).length / 4) : 0);
  const decisions = existsSync(join(dir, "development/decisions.md")) ? read(join(dir, "development/decisions.md")) : "";
  const active = Math.round(decisions.slice(0, Math.max(0, decisions.search(/^##\s+Log\b/m))).length / 4);
  const always = size("glossary.md");
  const change = always + size("architecture.md") + size("workflow.md") + size("testing.md") + active;
  const stated = (label: string) =>
    Number(new RegExp(`\\|\\s*${label}\\s*\\|[^\\n]*?\\|\\s*~?(\\d[\\d,]*)\\s*tokens`, "i").exec(skillText)?.[1]?.replace(/,/g, "") ?? NaN);
  const statedAlways = stated("Always");
  const statedChange = stated("Change");
  const off = (measured: number, claimed: number) => Number.isFinite(claimed) && Math.abs(measured - claimed) > Math.max(200, measured * 0.25);
  add("note", join(dir, "SKILL.md"), `tokens measured: always ${always}, change ${change}`);
  if (off(always, statedAlways) || off(change, statedChange)) {
    add("warn", join(dir, "SKILL.md"), `the load plan states always ${statedAlways}, change ${statedChange}; measured ${always} and ${change}`);
  }
}

function adrFiles(root: string, id: string): string[] {
  const dir = join(root, "docs", "decisions");
  if (!existsSync(dir)) return [];
  const number = id.slice("ADR-".length);
  return readdirSync(dir).filter((file) => file.startsWith(`${number}-`) && file.endsWith(".md")).map((file) => join(dir, file));
}

/** Checks every ADR, and returns the ids of the superseded ones. */
function checkProjectDecisions(ctx: Context): Set<string> {
  const { root, add } = ctx;
  const superseded = new Set<string>();
  const dir = join(root, "docs", "decisions");
  if (!existsSync(dir)) return superseded;
  const seen = new Map<string, string>();
  for (const file of readdirSync(dir)) {
    const number = /^(\d{4})-.*\.md$/.exec(file)?.[1];
    if (!number) continue;
    const path = join(dir, file);
    if (seen.has(number)) add("fail", path, `ADR number ${number} is also used by ${seen.get(number)}`);
    seen.set(number, file);
    const text = read(path);
    if (text.includes("{{")) add("fail", path, "an unfilled {{slot}} remains");
    if (text.includes("<!-- gyos:")) add("fail", path, "a <!-- gyos: … --> generator instruction remains");
    if (text.includes("${CLAUDE_PLUGIN_ROOT}")) add("fail", path, "${CLAUDE_PLUGIN_ROOT} doesn't exist in a product");
    const heading = text.split("\n").find((line) => /^#\s/.test(line)) ?? "";
    const id = ADR_HEADING.exec(heading)?.[1];
    if (!id) add("fail", path, `the title isn't "# ADR-${number} — Title (date)"`);
    else if (id !== `ADR-${number}`) add("fail", path, `the title says ${id}, the file name says ADR-${number}`);
    const status = text.split("\n").find((line) => /^Status:/i.test(line.trim()));
    if (status && supersededBy(status)) superseded.add(`ADR-${number}`);
    const found = confirmations(text.split("\n"), 0);
    if (found.length !== 1) add("fail", path, `has ${found.length} Confirmation lines; an ADR has exactly one`);
    for (const confirmation of found) checkConfirmation(ctx, path, confirmation, null);
    checkLinks(root, path, add);
  }
  return superseded;
}

function checkEntryConfirmations(ctx: Context, file: string, entry: Entry, context: string): void {
  if (entry.confirmations.length !== 1) {
    ctx.add("fail", file, `line ${entry.line}: ${entry.id} has ${entry.confirmations.length} Confirmation lines; an entry has exactly one`);
  }
  for (const confirmation of entry.confirmations) checkConfirmation(ctx, file, confirmation, context);
}

/** One Confirmation resolves to a scenario, a test or an invariant that exists. */
function checkConfirmation(ctx: Context, file: string, confirmation: { line: number; value: string }, context: string | null): void {
  const { root, add } = ctx;
  const where = `line ${confirmation.line}`;
  if (!confirmation.value) {
    add("fail", file, `${where}: Confirmation is empty`);
    return;
  }
  if (/^Unverified:/.test(confirmation.value)) {
    add("note", file, `${where}: Confirmation is unverified`);
    return;
  }
  const scenarios = context ? (ctx.scenariosByContext.get(context) ?? new Set<string>()) : ctx.allScenarios;
  for (const part of confirmation.value.split(";").map((item) => item.trim()).filter(Boolean)) {
    const scenario = /^scenario:\s*"(.+)"$/.exec(part);
    const test = /^test:\s*(\S+)\s+"(.+)"$/.exec(part);
    const invariant = /^invariant:\s*(?:([a-z0-9-]+)\/)?([CM])(\d+)$/.exec(part);
    if (scenario) {
      if (!scenarios.has(scenario[1])) add("fail", file, `${where}: no scenario named "${scenario[1]}"`);
    } else if (test) {
      const target = resolve(root, test[1]);
      if (!isInside(root, target) || !existsSync(target) || !statSync(target).isFile()) add("fail", file, `${where}: no test file ${test[1]}`);
      else if (!read(target).includes(test[2])) add("fail", file, `${where}: no test "${test[2]}" in ${test[1]}`);
    } else if (invariant) {
      const [, owner, kind, raw] = invariant;
      const number = Number(raw);
      if (kind === "M") {
        if (ctx.moduleInvariants && !ctx.moduleInvariants.has(number)) add("fail", file, `${where}: no invariant M${number} in docs/standards/module.md`);
      } else {
        const ownerName = owner ?? context;
        if (!ownerName) add("fail", file, `${where}: "C${number}" needs its context, as <context>/C${number}, outside a skill`);
        else if (!ctx.invariantsByContext.get(ownerName)?.has(number)) add("fail", file, `${where}: no invariant C${number} in ${ownerName}'s architecture.md`);
      }
    } else {
      add("fail", file, `${where}: "${part}" isn't a Confirmation (scenario: "…", test: <path> "…", invariant: C<n>)`);
    }
  }
}

/** Relative and repo-absolute links resolve inside the repo, anchors included. */
function checkLinks(root: string, file: string, add: Add): void {
  const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  linesOutsideFences(read(file), false).forEach((line, index) => {
    for (const [, target] of line.matchAll(link)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target === "#") continue;
      const [rawPath, fragment] = target.split("#");
      let path: string;
      try {
        path = decodeURI(rawPath);
      } catch {
        add("fail", file, `line ${index + 1}: the link ${target} isn't a valid URI`);
        continue;
      }
      const resolved = !path ? file : path.startsWith("/") ? join(root, path) : resolve(dirname(file), path);
      if (!isInside(root, resolved)) add("fail", file, `line ${index + 1}: the link ${target} points outside the repo`);
      else if (!existsSync(resolved)) add("fail", file, `line ${index + 1}: broken link ${target}`);
      else if (fragment && resolved.endsWith(".md") && !anchorsOf(resolved).has(fragment)) {
        add("fail", file, `line ${index + 1}: no heading for #${fragment} in ${relative(root, resolved)}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const root = resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");
  const findings = diagnose(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ version: DOCTOR_VERSION, findings }, null, 2));
  } else {
    const mark: Record<Level, string> = { fail: "✘", warn: "⚠", note: "·" };
    for (const level of ["fail", "warn", "note"] as const) {
      for (const finding of findings.filter((item) => item.level === level)) {
        console.log(`${mark[level]} ${finding.file}: ${finding.message}`);
      }
    }
    const count = (level: Level) => findings.filter((item) => item.level === level).length;
    console.log(`\nGYOS doctor ${DOCTOR_VERSION}: ${count("fail")} failed, ${count("warn")} warnings, ${count("note")} notes.`);
  }
  if (findings.some((finding) => finding.level === "fail")) process.exitCode = 1;
}

if (import.meta.main) main();
