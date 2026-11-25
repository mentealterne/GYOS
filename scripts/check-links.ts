/**
 * Checks every relative link in the repo's Markdown: the file must exist and, when the link has
 * a #fragment, the target must have a heading with that GitHub anchor. External links are not
 * checked: they fail for reasons that have nothing to do with this repo (rate limits, paywalls).
 *
 * Run: node scripts/check-links.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SKIPPED = new Set([".git", "node_modules", "dist", "coverage"]);
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (SKIPPED.has(name)) return [];
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/** The text outside fenced code blocks and inline code, line by line. */
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

/** GitHub's anchor for a heading: lowercase, punctuation dropped, spaces to hyphens. */
function slug(heading: string): string {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anchorsOf(file: string): Set<string> {
  const seen = new Map<string, number>();
  const anchors = new Set<string>();
  for (const line of proseLines(readFileSync(file, "utf8"))) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slug(heading[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

const problems: string[] = [];
const files = markdownFiles(ROOT);

for (const file of files) {
  proseLines(readFileSync(file, "utf8")).forEach((line, index) => {
    for (const [, target] of line.matchAll(LINK)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes("${")) continue;
      const [path, fragment] = target.split("#");
      const resolved = path ? resolve(dirname(file), decodeURI(path)) : file;
      const where = `${relative(ROOT, file)}:${index + 1}`;
      if (!existsSync(resolved)) {
        problems.push(`${where} → ${target}: no such file`);
      } else if (fragment && resolved.endsWith(".md") && !anchorsOf(resolved).has(fragment)) {
        problems.push(`${where} → ${target}: no heading with that anchor`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`Broken links (${problems.length}):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Links OK in ${files.length} Markdown files.`);
