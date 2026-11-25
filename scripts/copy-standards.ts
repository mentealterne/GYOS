/**
 * Copies GYOS's standards into a product repo, as docs/standards/*.md, without the parts that
 * only make sense inside GYOS: every region between `<!-- gyos-only:start -->` and
 * `<!-- gyos-only:end -->` is dropped. Each copy starts with a header naming the GYOS version it
 * came from, which is how a later run (and /gyos:upgrade) recognises a file it may replace.
 *
 * A file at the target that doesn't carry that header was written by someone else: it is never
 * overwritten.
 *
 * Run: node scripts/copy-standards.ts <product-repo>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const STANDARDS = ["module.md", "domain-skill.md"];
const HEADER = /^<!-- Copied from GYOS /;
const START = "<!-- gyos-only:start -->";
const END = "<!-- gyos-only:end -->";

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

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/copy-standards.ts <product-repo>");
    process.exit(2);
  }
  const repo = resolve(target);
  if (!existsSync(repo)) {
    console.error(`No such directory: ${repo}`);
    process.exit(2);
  }

  const { version } = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8")) as {
    version: string;
  };
  const date = new Date().toISOString().slice(0, 10);
  const outDir = join(repo, "docs", "standards");
  mkdirSync(outDir, { recursive: true });

  for (const name of STANDARDS) {
    const destination = join(outDir, name);
    if (existsSync(destination) && !HEADER.test(readFileSync(destination, "utf8"))) {
      console.error(`${destination} wasn't written by GYOS; leaving it untouched.`);
      process.exitCode = 1;
      continue;
    }
    const body = stripGyosOnly(readFileSync(join(ROOT, "standards", name), "utf8"), name);
    const header =
      `<!-- Copied from GYOS ${version} (standards/${name}) on ${date}. ` +
      "Don't edit it here: a local divergence is a decision in docs/decisions/. -->\n\n";
    writeFileSync(destination, header + body);
    console.log(`Wrote ${destination}`);
  }
}

if (import.meta.main) main();
