/**
 * Copies GYOS's standards into a product repo, as docs/standards/*.md, without the parts that
 * only make sense inside GYOS: every region between `<!-- gyos-only:start -->` and
 * `<!-- gyos-only:end -->` is dropped. Each copy starts with a header naming the GYOS version it
 * came from, which is how a later run (and /gyos:upgrade) recognises a file it may replace.
 *
 * - A file at the target without that header was written by someone else: never overwritten.
 * - Every standard is prepared before anything is written, so a bad one never leaves a partial copy.
 * - A copy that would still mention files only the plugin has is refused: mark that part gyos-only.
 * - A copy whose content hasn't changed is left alone, header date included.
 *
 * Run: node scripts/copy-standards.ts <product-repo>
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const STANDARDS = ["module.md", "host.md", "domain-skill.md"];
const HEADER = /^<!-- Copied from GYOS [^\n]*-->\n\n/;
const START = "<!-- gyos-only:start -->";
const END = "<!-- gyos-only:end -->";

/** References that exist only inside the plugin, and so must not survive into a product. */
const PLUGIN_ONLY = [
  /\bknowledge\/[\w-]+\.md/,
  /\btemplates\/[\w-]+/,
  /\$\{CLAUDE_PLUGIN_ROOT\}\//,
  /\bskills\/(?:init|discover|context|feature|decide|doctor)\b/,
  /\bscripts\/(?:verify-templates|new-module|copy-standards|template-names)(?:\.test)?\.ts/,
  /\bdocs\/plan\.md/,
  /gyos-only:/,
];

/** The text without its GYOS-only regions. Unbalanced markers are an error, never a guess. */
export function stripGyosOnly(text: string, name: string): string {
  const kept: string[] = [];
  let isInside = false;
  for (const line of text.split("\n")) {
    const marker = line.trim();
    if (marker === START) {
      if (isInside) throw new Error(`${name}: nested ${START}`);
      isInside = true;
    } else if (marker === END) {
      if (!isInside) throw new Error(`${name}: ${END} without a start`);
      isInside = false;
    } else if (!isInside) {
      kept.push(line);
    }
  }
  if (isInside) throw new Error(`${name}: ${START} is never closed`);
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** The plugin-only references left in a stripped standard, as "line: text". */
export function pluginOnlyLeftovers(text: string): string[] {
  return text
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => PLUGIN_ONLY.some((pattern) => pattern.test(line)))
    .map(({ line, index }) => `${index + 1}: ${line.trim().slice(0, 100)}`);
}

export function copyStandards(repo: string, version: string, date: string): { written: string[]; refused: string[] } {
  if (!existsSync(repo) || !statSync(repo).isDirectory()) throw new Error(`Not a directory: ${repo}`);

  const prepared = STANDARDS.map((name) => {
    const body = stripGyosOnly(readFileSync(join(ROOT, "standards", name), "utf8"), name);
    const leftovers = pluginOnlyLeftovers(body);
    if (leftovers.length > 0) {
      throw new Error(`standards/${name} still mentions plugin-only files once stripped; mark them gyos-only:\n  ${leftovers.join("\n  ")}`);
    }
    return { name, body };
  });

  const outDir = join(repo, "docs", "standards");
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const refused: string[] = [];
  for (const { name, body } of prepared) {
    const destination = join(outDir, name);
    if (existsSync(destination)) {
      const current = readFileSync(destination, "utf8");
      if (!HEADER.test(current)) {
        refused.push(destination);
        continue;
      }
      if (current.replace(HEADER, "") === body) continue;
    }
    const header =
      `<!-- Copied from GYOS ${version} (standards/${name}) on ${date}. ` +
      "Don't edit it here: a local divergence is a decision in docs/decisions/. -->\n\n";
    writeFileSync(destination, header + body);
    written.push(destination);
  }
  return { written, refused };
}

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/copy-standards.ts <product-repo>");
    process.exit(2);
  }
  const { version } = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8")) as {
    version: string;
  };
  try {
    const { written, refused } = copyStandards(resolve(target), version, new Date().toISOString().slice(0, 10));
    for (const file of written) console.log(`Wrote ${file}`);
    for (const file of refused) console.error(`${file} wasn't written by GYOS; left untouched.`);
    if (written.length === 0 && refused.length === 0) console.log("Standards already up to date.");
    if (refused.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
}

if (import.meta.main) main();
