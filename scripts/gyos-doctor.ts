/**
 * GYOS doctor: checks that a product's domain skills and decisions are still in the shape
 * docs/standards/domain-skill.md describes. It is copied into every product GYOS sets up, runs in
 * its CI, and needs nothing but Node 24.
 *
 * Run from the product root:   node scripts/gyos-doctor.ts [<product-root>] [--json]
 * Exit code: 1 if any check fails, 0 otherwise. Warnings and notes never fail the run.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export type Level = "fail" | "warn" | "note";

export interface Finding {
  level: Level;
  file: string;
  message: string;
}

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

// ---------------------------------------------------------------------------------------------
// Small helpers

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function filesUnder(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
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

/** The lines outside fenced code blocks, with inline code removed. */
function proseLines(text: string): string[] {
  let isInFence = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      isInFence = !isInFence;
      return "";
    }
    return isInFence ? "" : line.replace(/`[^`]*`/g, "");
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

function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of proseLines(read(file))) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
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

/** The terms listed after "Vocabulary:" up to the first full stop. */
export function vocabulary(text: string): string[] {
  const match = /Vocabulary:\s*([^.]*)\./i.exec(text);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((term) => term.trim().replace(/^["'`]|["'`]$/g, ""))
    .filter((term) => term.length > 0);
}

interface Decisions {
  activeIds: string[];
  activeRows: number;
  logLines: number;
  logIds: string[];
  superseded: Set<string>;
}

export function parseDecisions(text: string): Decisions {
  const lines = text.split("\n");
  const activeStart = lines.findIndex((line) => /^##\s+Active\b/.test(line));
  const logStart = lines.findIndex((line) => /^##\s+Log\b/.test(line));
  const activeIds: string[] = [];
  if (activeStart >= 0) {
    for (const line of lines.slice(activeStart + 1, logStart >= 0 ? logStart : undefined)) {
      const cells = line.split("|").map((cell) => cell.trim());
      if (cells.length < 3 || /^-+$/.test(cells[1]) || cells[1] === "Id") continue;
      activeIds.push(cells[1]);
    }
  }
  const log = logStart >= 0 ? lines.slice(logStart + 1) : [];
  const logIds: string[] = [];
  const superseded = new Set<string>();
  let currentId: string | null = null;
  for (const line of log) {
    const heading = /^###\s+(\S+)\s+—/.exec(line);
    if (heading) {
      currentId = heading[1];
      logIds.push(currentId);
      continue;
    }
    const by = /superseded by:\s*([^\s·]+)/i.exec(line);
    if (by && currentId && by[1] !== "—" && by[1] !== "-") superseded.add(currentId);
  }
  return { activeIds, activeRows: activeIds.length, logLines: log.length, logIds, superseded };
}

/** The `C<n>` invariants an architecture.md defines, in order of appearance. */
export function invariantNumbers(text: string): number[] {
  return [...text.matchAll(/\*\*C(\d+)\./g)].map((match) => Number(match[1]));
}

// ---------------------------------------------------------------------------------------------
// The checks

export function diagnose(root: string): Finding[] {
  const findings: Finding[] = [];
  const add = (level: Level, file: string, message: string) =>
    findings.push({ level, file: relative(root, file) || ".", message });

  const skillsDir = join(root, ".claude", "skills");
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((name) => {
        const skillFile = join(skillsDir, name, "SKILL.md");
        return existsSync(skillFile) && /gyos-standard:/.test(read(skillFile));
      })
    : [];

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

  const invariantsByContext = new Map<string, Set<number>>();
  for (const name of skills) {
    const architecture = join(skillsDir, name, "architecture.md");
    if (existsSync(architecture)) invariantsByContext.set(name, new Set(invariantNumbers(read(architecture))));
  }

  for (const name of skills) checkSkill(root, name, invariantsByContext, add);
  checkProjectDecisions(root, invariantsByContext, add);
  return findings;
}

type Add = (level: Level, file: string, message: string) => void;

function checkSkill(root: string, name: string, invariants: Map<string, Set<number>>, add: Add): void {
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
    if (!fields.get("metadata.gyos-standard")) add("fail", at("SKILL.md"), "metadata.gyos-standard is missing");
    const glossary = existsSync(at("glossary.md")) ? read(at("glossary.md")).toLowerCase() : "";
    for (const term of vocabulary(`${description} ${whenToUse}`)) {
      if (!glossary.includes(term.toLowerCase())) {
        add("fail", at("SKILL.md"), `vocabulary term "${term}" is not in glossary.md`);
      }
    }
  }

  // Every markdown file of the skill.
  for (const file of filesUnder(dir, ".md")) {
    const text = read(file);
    const short = relative(dir, file);
    if (text.includes("{{")) add("fail", file, "an unfilled {{slot}} remains");
    if (text.includes("<!-- gyos:")) add("fail", file, "a <!-- gyos: … --> generator instruction remains");
    if (text.includes("${CLAUDE_PLUGIN_ROOT}")) add("fail", file, "${CLAUDE_PLUGIN_ROOT} doesn't exist in a product");
    const ceiling = CEILINGS[short];
    if (ceiling) {
      const lines = lineCount(text);
      if (lines >= 2 * ceiling) add("fail", file, `${lines} lines, twice its ceiling of ${ceiling}`);
      else if (lines > ceiling) add("warn", file, `${lines} lines, over its ceiling of ${ceiling}`);
    }
    text.split("\n").forEach((line, index) => {
      if (/Unverified:/.test(line)) add("note", file, `line ${index + 1}: ${line.trim().slice(0, 100)}`);
    });
    checkLinks(root, file, add);
  }

  // Invariant numbers are unique.
  if (existsSync(at("architecture.md"))) {
    const numbers = invariantNumbers(read(at("architecture.md")));
    const duplicates = numbers.filter((number, index) => numbers.indexOf(number) !== index);
    for (const number of new Set(duplicates)) add("fail", at("architecture.md"), `invariant C${number} is defined twice`);
    checkTrace(root, name, at("architecture.md"), add);
  }

  // Decisions.
  if (existsSync(at("development/decisions.md"))) {
    const file = at("development/decisions.md");
    const text = read(file);
    const decisions = parseDecisions(text);
    if (decisions.activeRows > 2 * ACTIVE_ROWS_CEILING) add("fail", file, `${decisions.activeRows} active rows, twice the ceiling`);
    else if (decisions.activeRows > ACTIVE_ROWS_CEILING) add("warn", file, `${decisions.activeRows} active rows, over the ceiling of ${ACTIVE_ROWS_CEILING}`);
    if (decisions.logLines > 2 * LOG_LINES_CEILING) add("fail", file, `the log is ${decisions.logLines} lines, twice the ceiling`);
    else if (decisions.logLines > LOG_LINES_CEILING) add("warn", file, `the log is ${decisions.logLines} lines; archive superseded entries older than 180 days`);
    const ownId = new RegExp(`^${name}-D\\d+$`);
    const duplicateLog = decisions.logIds.filter((id, index) => decisions.logIds.indexOf(id) !== index);
    for (const id of new Set(duplicateLog)) add("fail", file, `log id ${id} is used twice`);
    for (const id of decisions.logIds) {
      if (!ownId.test(id)) add("fail", file, `log id ${id} should look like ${name}-D<n>`);
    }
    for (const id of decisions.activeIds) {
      if (ownId.test(id)) {
        if (!decisions.logIds.includes(id)) add("fail", file, `active ${id} has no entry in the log`);
        if (decisions.superseded.has(id)) add("fail", file, `active ${id} is superseded; remove its row`);
      } else if (/^ADR-\d{4}$/.test(id)) {
        if (!adrFile(root, id)) add("fail", file, `active ${id} has no file in docs/decisions/`);
      } else {
        add("fail", file, `active id "${id}" is neither ${name}-D<n> nor ADR-NNNN`);
      }
    }
    checkConfirmations(root, file, text, name, invariants, add);
  }

  // Every feature file is indexed in scenarios.md.
  const features = filesUnder(join(root, "modules", name, "features"), ".feature");
  if (features.length > 0) {
    if (!existsSync(at("scenarios.md"))) {
      add("fail", at("scenarios.md"), `missing, but modules/${name}/features has ${features.length} .feature files`);
    } else {
      const scenarios = read(at("scenarios.md"));
      for (const feature of features) {
        const file = relative(join(root, "modules", name, "features"), feature);
        if (!scenarios.includes(file)) add("fail", at("scenarios.md"), `doesn't index ${file}`);
      }
    }
  }
}

function adrFile(root: string, id: string): string | null {
  const dir = join(root, "docs", "decisions");
  if (!existsSync(dir)) return null;
  const number = id.slice("ADR-".length);
  const name = readdirSync(dir).find((file) => file.startsWith(`${number}-`) && file.endsWith(".md"));
  return name ? join(dir, name) : null;
}

function checkProjectDecisions(root: string, invariants: Map<string, Set<number>>, add: Add): void {
  const dir = join(root, "docs", "decisions");
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    const path = join(dir, file);
    const text = read(path);
    if (text.includes("{{")) add("fail", path, "an unfilled {{slot}} remains");
    if (text.includes("<!-- gyos:")) add("fail", path, "a <!-- gyos: … --> generator instruction remains");
    checkConfirmations(root, path, text, null, invariants, add);
    checkLinks(root, path, add);
  }
}

/** Every Confirmation resolves to a scenario, a test or an invariant that exists. */
function checkConfirmations(
  root: string,
  file: string,
  text: string,
  context: string | null,
  invariants: Map<string, Set<number>>,
  add: Add,
): void {
  const featureRoots = context ? [join(root, "modules", context, "features")] : [join(root, "modules")];
  const scenarioNames = new Set(
    featureRoots
      .flatMap((dir) => filesUnder(dir, ".feature"))
      .flatMap((feature) =>
        read(feature)
          .split("\n")
          .map((line) => /^\s*(?:Scenario Outline|Scenario|Example):\s*(.+?)\s*$/.exec(line)?.[1])
          .filter((name): name is string => Boolean(name)),
      ),
  );
  const moduleStandard = join(root, "docs", "standards", "module.md");
  const moduleInvariants = existsSync(moduleStandard)
    ? new Set([...read(moduleStandard).matchAll(/\*\*M(\d+)\./g)].map((match) => Number(match[1])))
    : null;

  text.split("\n").forEach((line, index) => {
    const confirmation = /^Confirmation:\s*(.*)$/.exec(line.trim());
    if (!confirmation) return;
    const where = `line ${index + 1}`;
    if (/Unverified:/.test(confirmation[1])) {
      add("note", file, `${where}: Confirmation is unverified`);
      return;
    }
    for (const part of confirmation[1].split(";").map((item) => item.trim()).filter(Boolean)) {
      const scenario = /^scenario:\s*"(.+)"$/.exec(part);
      const test = /^test:\s*(\S+)\s+"(.+)"$/.exec(part);
      const invariant = /^invariant:\s*(?:([a-z0-9-]+)\/)?([CM])(\d+)$/.exec(part);
      if (scenario) {
        if (!scenarioNames.has(scenario[1])) add("fail", file, `${where}: no scenario named "${scenario[1]}"`);
      } else if (test) {
        const target = join(root, test[1]);
        if (!existsSync(target)) add("fail", file, `${where}: no test file ${test[1]}`);
        else if (!read(target).includes(test[2])) add("fail", file, `${where}: no test "${test[2]}" in ${test[1]}`);
      } else if (invariant) {
        const [, owner, kind, raw] = invariant;
        const number = Number(raw);
        if (kind === "M") {
          if (moduleInvariants && !moduleInvariants.has(number)) add("fail", file, `${where}: no invariant M${number} in docs/standards/module.md`);
        } else {
          const ownerName = owner ?? context;
          if (!ownerName) add("fail", file, `${where}: "C${number}" needs its context, as <context>/C${number}, outside a skill`);
          else if (!invariants.get(ownerName)?.has(number)) add("fail", file, `${where}: no invariant C${number} in ${ownerName}'s architecture.md`);
        }
      } else {
        add("fail", file, `${where}: "${part}" isn't a Confirmation (scenario: "…", test: <path> "…", invariant: C<n>)`);
      }
    }
  });
}

/** Relative links resolve, anchors included. */
function checkLinks(root: string, file: string, add: Add): void {
  const link = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  proseLines(read(file)).forEach((line, index) => {
    for (const [, target] of line.matchAll(link)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") && !target.slice(1)) continue;
      const [path, fragment] = target.split("#");
      const resolved = path ? resolve(dirname(file), decodeURI(path)) : file;
      if (!existsSync(resolved)) {
        add("fail", file, `line ${index + 1}: broken link ${target}`);
      } else if (fragment && resolved.endsWith(".md") && !anchorsOf(resolved).has(fragment)) {
        add("fail", file, `line ${index + 1}: no heading for #${fragment} in ${relative(root, resolved)}`);
      }
    }
  });
}

/** Every file named in the trace exists in the module. */
function checkTrace(root: string, name: string, architecture: string, add: Add): void {
  const text = read(architecture);
  const start = text.indexOf("The trace");
  if (start < 0) return;
  const block = /```[^\n]*\n([\s\S]*?)```/.exec(text.slice(start));
  if (!block) return;
  const sources = filesUnder(join(root, "modules", name, "src"), ".ts").map((file) => file.split("/").slice(-2).join("/"));
  for (const [path] of block[1].matchAll(/[\w./-]+\.ts\b/g)) {
    const tail = path.split("/").slice(-2).join("/");
    if (!sources.some((source) => source.endsWith(tail))) add("warn", architecture, `the trace names ${path}, which isn't in modules/${name}/src`);
  }
}

// ---------------------------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const root = resolve(args.find((arg) => !arg.startsWith("--")) ?? ".");
  const findings = diagnose(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    const mark: Record<Level, string> = { fail: "✘", warn: "⚠", note: "·" };
    for (const level of ["fail", "warn", "note"] as const) {
      for (const finding of findings.filter((item) => item.level === level)) {
        console.log(`${mark[level]} ${finding.file}: ${finding.message}`);
      }
    }
    const count = (level: Level) => findings.filter((item) => item.level === level).length;
    console.log(`\nGYOS doctor: ${count("fail")} failed, ${count("warn")} warnings, ${count("note")} notes.`);
  }
  if (findings.some((finding) => finding.level === "fail")) process.exitCode = 1;
}

if (import.meta.main) main();
