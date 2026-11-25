// Scaffolds a domain module from templates/module, deterministically.
//
//   node scripts/new-module.ts <workspace-dir> <name>
//
// Copies the template to <workspace-dir>/modules/<name> and renames its three tokens, in paths and
// in contents, with a plain case-sensitive replace:
//   sample → the kebab-case name: package, Postgres schema, folders, strings;
//   Sample → its PascalCase form: types and functions;
//   SAMPLE → its UPPER_SNAKE form: constants.
// The migration lock key is left as it is: it is the same in every module of a workspace.
// It renames only the module: the example area, items, and its first migration come along, and
// the output says what to replace before the first deploy.
// No dependencies. Runs with Node's type stripping (Node 24), so erasable syntax only.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = fileURLToPath(new URL("../templates/module/", import.meta.url));

/** kebab-case, starting with a letter. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Postgres identifiers are at most 63 bytes, and the bookkeeping table is __migrations_<name>. */
const MAX_NAME_LENGTH = 40;
/** Schemas a module can't own: the default one, and the shared migration bookkeeping. */
const RESERVED_NAMES = new Set(["public", "drizzle"]);
/** Never copied from the template. */
const SKIPPED = new Set(["node_modules", "dist", "reports", ".turbo", "coverage", ".DS_Store"]);

interface ModuleNames {
  kebab: string;
  pascal: string;
  upper: string;
}

function validateName(name: string): string[] {
  const problems: string[] = [];
  if (!NAME_PATTERN.test(name)) {
    problems.push(`"${name}" is not kebab-case: lowercase letters and digits, words joined by "-"`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    problems.push(`"${name}" is longer than ${MAX_NAME_LENGTH} characters`);
  }
  if (RESERVED_NAMES.has(name)) {
    problems.push(`"${name}" is reserved: it names a schema no module can own`);
  }
  return problems;
}

function namesFor(kebab: string): ModuleNames {
  const words = kebab.split("-");
  return {
    kebab,
    pascal: words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(""),
    upper: words.map((word) => word.toUpperCase()).join("_"),
  };
}

function rename(text: string, names: ModuleNames): string {
  return text
    .replaceAll("SAMPLE", names.upper)
    .replaceAll("Sample", names.pascal)
    .replaceAll("sample", names.kebab);
}

function templateFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      if (SKIPPED.has(entry)) return [];
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? templateFiles(path) : [path];
    });
}

function scaffoldModule(workspaceDir: string, name: string): string[] {
  const problems = validateName(name);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const workspace = resolve(workspaceDir);
  if (!existsSync(join(workspace, "pnpm-workspace.yaml"))) {
    throw new Error(`${workspace} is not a workspace: it has no pnpm-workspace.yaml`);
  }
  const target = join(workspace, "modules", name);
  if (existsSync(target)) throw new Error(`${target} already exists`);

  const names = namesFor(name);
  const created: string[] = [];
  for (const source of templateFiles(TEMPLATE_DIR)) {
    const destination = join(target, rename(relative(TEMPLATE_DIR, source), names));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rename(readFileSync(source, "utf8"), names));
    created.push(relative(workspace, destination));
  }
  return created;
}

const args = process.argv.slice(2);
const [workspaceDir, name] = args;
if (args.length !== 2 || workspaceDir === undefined || name === undefined) {
  console.error("usage: node scripts/new-module.ts <workspace-dir> <name>");
  process.exitCode = 2;
} else {
  try {
    const created = scaffoldModule(workspaceDir, name);
    const names = namesFor(name);
    console.log(
      `Created @module/${names.kebab} in modules/${names.kebab} (${created.length} files): ` +
        `schema "${names.kebab}", create${names.pascal}Module().`,
    );
    console.log(
      [
        "",
        "Next:",
        "  1. pnpm install, then pnpm typecheck and pnpm test.",
        "  2. The items area is an example: src/items/, src/items-vocabulary.ts (the \"./items\" export),",
        "     features/items.feature and their tests. Replace it with this module's own area.",
        `  3. Before the first deploy, delete modules/${names.kebab}/drizzle/ and run`,
        `     pnpm --filter @module/${names.kebab} db:generate: the shipped 0000_init migration creates`,
        `     "${names.kebab}".items, and once deployed, migrations are expand-only.`,
        `See modules/${names.kebab}/README.md.`,
      ].join("\n"),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
