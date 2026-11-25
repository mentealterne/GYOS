// Scaffolds a domain module from templates/module, deterministically, and can add it to a host.
//
//   node scripts/new-module.ts <workspace-dir> <name> [--area <plural> --entity <singular>] [--host <dir>]
//
// Copies the template to <workspace-dir>/modules/<name> and renames it, in paths and in contents
// (scripts/template-names.ts says how each form is chosen):
//   sample → the module's name: kebab-case (package, Postgres schema, folders, strings),
//            PascalCase (Sample: types, functions), UPPER_SNAKE (SAMPLE: constants);
//   items/item → the area and its entity, --area and --entity (kebab-case, both or neither;
//            "items" and "item" when left out): folders and file names, the "./items" export,
//            identifiers, the table, its index and the migration that creates them, the
//            .feature file and its steps, the tests, the route file. A multi-word name works:
//            --area treatment-plans --entity treatment-plan gives src/treatment-plans/,
//            TreatmentPlan, treatmentPlanId, the table treatment_plans, "a treatment plan".
// The migration is renamed as text, like the rest: drizzle-kit is not installed when this runs,
// and renaming keeps the template's migration history (one 0000_init) as it is. drizzle-kit
// check and generate then find the migrations consistent and nothing to do (verify-templates).
// The migration lock key is left as it is: it is the same in every module of a workspace.
// The area is still an example; the output says what to replace before the first deploy.
//
// --host <dir> (a path in the workspace, such as apps/api) also adds the module to that host,
// built from templates/apps/api:
//   - "@module/<name>": "workspace:*" in the host's package.json dependencies;
//   - an import, a field of Modules, a build line and a return line in src/modules.ts;
//   - an import and a mount in src/http/routes/index.ts, the module's routes at /<name>;
//   - src/http/routes/<name>.ts and its test, rendered from templates/host-module like the module.
// Each line goes right above its gyos:* marker. The host is checked before anything is written:
// a marker missing, or found twice, refuses the whole run. Running it again changes nothing: a
// host file that already imports the module ("@module/<name>" in src/modules.ts, ./<name>.ts in
// src/http/routes/index.ts) gets none of its lines again, even edited by hand since; a route file
// already there is kept as it is; and a module that exists is not scaffolded again (with --host
// only; without it, that is an error). For a module that exists, routes are rendered only with
// its own area and entity: one its package.json doesn't export, or whose vocabulary has no
// create<Entity>InputSchema, is refused before anything is written.
// No dependencies. Runs with Node's type stripping (Node 24), so erasable syntax only.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formsOf,
  identifiersIn,
  renderPath,
  renderText,
  RESERVED_WORDS,
  TEMPLATE_AREA,
  TEMPLATE_ENTITY,
  type TemplateNames,
} from "./template-names.ts";

const TEMPLATE_DIR = fileURLToPath(new URL("../templates/module/", import.meta.url));
const HOST_TEMPLATE_DIR = fileURLToPath(new URL("../templates/host-module/", import.meta.url));

/** kebab-case, starting with a letter. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/**
 * Postgres identifiers are at most 63 bytes: the bookkeeping table is __migrations_<name>, and
 * the area's unique index is <area>_tenant_id_name_key.
 */
const MAX_NAME_LENGTH = 40;
/** Schemas a module can't own: the default one, and the shared migration bookkeeping. */
const RESERVED_NAMES = new Set(["public", "drizzle"]);
/**
 * Names a module can't take because its domain skill, .claude/skills/<name>, would collide with a
 * command: GYOS's own skills, and Claude Code's built-in commands (the list in
 * standards/domain-skill.md, "Where it lives"; scripts/gyos-doctor.ts checks the same list).
 */
const RESERVED_SKILL_NAMES = new Set([
  "init", "discover", "context", "feature", "decide", "doctor", "adopt", "split", "merge", "upgrade",
  "add-dir", "agents", "bug", "clear", "compact", "config", "cost", "exit", "export", "help",
  "hooks", "login", "logout", "mcp", "memory", "model", "permissions", "plugin", "pr-comments",
  "release-notes", "resume", "review", "rewind", "security-review", "status", "statusline",
  "terminal-setup", "todos", "usage", "vim",
]);
/** Folders of src/ that an area can't be called. */
const TAKEN_FOLDERS = new Set(["db", "config", "module-controllers", "tests"]);
/**
 * The area src/tests/unit/architecture/layers.test.ts makes up, to check that one area doesn't
 * reach into another's: a module whose own area had that name would fail those tests.
 */
const LAYER_TESTS_AREA = "other-area";
/**
 * Names a host can't give a module's variable: JavaScript's reserved words, and the names
 * src/modules.ts and src/http/routes/index.ts already use.
 */
const RESERVED_IDENTIFIERS = new Set([
  ...RESERVED_WORDS,
  "pool",
  "logger",
  "clock",
  "modules",
  "router",
]);
/** Never copied from the template. */
const SKIPPED = new Set(["node_modules", "dist", "reports", ".turbo", "coverage", ".DS_Store"]);

function kebabProblems(flag: string, name: string): string[] {
  const problems: string[] = [];
  if (!NAME_PATTERN.test(name)) {
    problems.push(`${flag} "${name}" is not kebab-case: lowercase letters and digits, words joined by "-"`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    problems.push(`${flag} "${name}" is longer than ${MAX_NAME_LENGTH} characters`);
  }
  return problems;
}

function validateName(name: string): string[] {
  const problems = kebabProblems("name", name);
  if (RESERVED_NAMES.has(name)) {
    problems.push(`"${name}" is reserved: it names a schema no module can own`);
  }
  if (RESERVED_SKILL_NAMES.has(name)) {
    problems.push(`"${name}" is reserved: its domain skill would collide with the /${name} command`);
  }
  return problems;
}

interface TemplateFile {
  /** Its path in the template, with "/". */
  file: string;
  /** Its path on disk. */
  path: string;
}

function templateFiles(dir: string, root: string = dir): TemplateFile[] {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      if (SKIPPED.has(entry)) return [];
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return templateFiles(path, root);
      return [{ file: relative(root, path).split(sep).join("/"), path }];
    });
}

/**
 * Whether the area and the entity can replace items and item: kebab-case, short enough for a
 * Postgres index name, distinct, not a folder src/ already has, and no form of them a name the
 * template's code already uses (`name`, `tenant`, `Error`, a reserved word). That last check is
 * conservative: some of those names would compile, but each would have to be checked by hand.
 */
function validateArea(names: TemplateNames, templates: readonly TemplateFile[]): string[] {
  const { area, entity } = names;
  const problems = [...kebabProblems("--area", area.kebab), ...kebabProblems("--entity", entity.kebab)];
  if (problems.length > 0) return problems;
  if (area.kebab === TEMPLATE_AREA && entity.kebab === TEMPLATE_ENTITY) return [];
  if (area.camel === entity.camel) problems.push(`--area and --entity must differ: both are "${area.kebab}"`);
  if (TAKEN_FOLDERS.has(area.kebab)) problems.push(`--area "${area.kebab}" is a folder src/ already has`);
  if (area.kebab === LAYER_TESTS_AREA) {
    problems.push(`--area "${area.kebab}" is the second area the layer tests make up: pick another name`);
  }
  const taken = identifiersIn(templates);
  for (const [flag, forms] of [["--area", area], ["--entity", entity]] as const) {
    const clashes = [forms.camel, forms.pascal].filter((form) => taken.has(form));
    if (clashes.length > 0) {
      problems.push(
        `${flag} "${forms.kebab}" would clash with a name the template already uses: ${clashes.join(", ")}. ` +
          "Pick a more specific one, such as treatment-plan for plan.",
      );
    }
  }
  return problems;
}

/** Two template files that the names would write to the same path. */
function pathClashes(templates: readonly TemplateFile[], names: TemplateNames): string[] {
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const { file } of templates) {
    const target = renderPath(file, names);
    const other = seen.get(target);
    if (other !== undefined) problems.push(`${other} and ${file} would both become ${target}`);
    seen.set(target, file);
  }
  return problems;
}

function resolveWorkspace(workspaceDir: string): string {
  const workspace = resolve(workspaceDir);
  if (!existsSync(join(workspace, "pnpm-workspace.yaml"))) {
    throw new Error(`${workspace} is not a workspace: it has no pnpm-workspace.yaml`);
  }
  return workspace;
}

function scaffoldModule(workspace: string, templates: readonly TemplateFile[], names: TemplateNames): string[] {
  const target = join(workspace, "modules", names.module.kebab);
  const created: string[] = [];
  for (const { file, path } of templates) {
    const destination = join(target, renderPath(file, names));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, renderText(file, readFileSync(path, "utf8"), names));
    created.push(relative(workspace, destination));
  }
  return created;
}

// --- The host -------------------------------------------------------------------------------

const MARKERS = {
  modulesImports: "// gyos:modules:imports",
  modulesType: "// gyos:modules:type",
  modulesBuild: "// gyos:modules:build",
  modulesReturn: "// gyos:modules:return",
  routesImports: "// gyos:routes:imports",
  routesMount: "// gyos:routes:mount",
} as const;

const HOST_FILES = {
  packageJson: "package.json",
  modules: "src/modules.ts",
  routes: "src/http/routes/index.ts",
} as const;

/** What wiring a module into a host writes: whole files, by path relative to the workspace. */
interface HostPlan {
  host: string;
  writes: Map<string, string>;
  /** Route files already in the host: they are the team's now, and stay as they are. */
  kept: string[];
  /** Route files rendered from templates/host-module, named after the area and its entity. */
  rendered: string[];
}

/**
 * Whether `path` is inside `root`, and not `root` itself. On Windows, relative() between two
 * drives gives an absolute path, so that counts as outside too. `path` is node:path by default;
 * a test passes node:path's win32 or posix flavour.
 */
export function isInside(
  root: string,
  path: string,
  { relative: relativeTo, isAbsolute, sep: separator }: Pick<typeof nodePath, "relative" | "isAbsolute" | "sep"> = nodePath,
): boolean {
  const inner = relativeTo(root, path);
  return inner !== "" && inner !== ".." && !inner.startsWith(`..${separator}`) && !isAbsolute(inner);
}

/**
 * For a module that exists already: why its routes can't be rendered with this area and entity,
 * or undefined when they can. They must be the module's own: its package.json exports the area
 * ("./<area>"), and that vocabulary file has the entity's create<Entity>InputSchema, which the
 * routes' test parses with.
 */
function areaMismatch(workspace: string, names: TemplateNames): string | undefined {
  const { module, area, entity } = names;
  const dir = join(workspace, "modules", module.kebab);
  const packageJson = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { exports?: Record<string, unknown> };
  const exports = packageJson.exports ?? {};
  const areas = Object.keys(exports)
    .filter((key) => key !== "." && key !== "./contracts")
    .map((key) => key.replace(/^\.\//, ""));
  const hint = areas.length === 1 ? ` Run it with the area it has: --area ${areas[0]} --entity <its singular>.` : "";
  if (!areas.includes(area.kebab)) {
    const found = areas.length === 0 ? "no area" : areas.map((name) => `"./${name}"`).join(", ");
    return (
      `modules/${module.kebab} exists, and its package.json exports ${found}, not "./${area.kebab}": ` +
      `routes rendered for "${area.kebab}" would not compile.${hint}`
    );
  }
  const entry = exports[`./${area.kebab}`];
  const source = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>)["@gyos/source"] : undefined;
  const vocabulary = typeof source === "string" ? join(dir, source) : undefined;
  const schema = `create${entity.pascal}InputSchema`;
  if (vocabulary === undefined || !existsSync(vocabulary) || !readFileSync(vocabulary, "utf8").includes(schema)) {
    return (
      `modules/${module.kebab} exports "./${area.kebab}", but it has no ${schema}: is "${entity.kebab}" its entity? ` +
      "Pass the --entity it was scaffolded with."
    );
  }
  return undefined;
}

/** The index of the line that holds `marker`, which must be there exactly once. */
function markerIndex(lines: readonly string[], marker: string, file: string): number {
  const at = lines.flatMap((candidate, index) => (candidate.trim() === marker ? [index] : []));
  const [index] = at;
  if (at.length !== 1 || index === undefined) {
    throw new Error(`${file}: expected the marker "${marker}" once, found it ${at.length} times`);
  }
  return index;
}

/**
 * The text with each line inserted right above the line that holds its marker, at its indentation.
 * Every marker must be there exactly once. When `wired` says the module is already in the file,
 * nothing is inserted: its lines may have been edited by hand since, and comparing them would add
 * the module a second time.
 */
function insertAbove(text: string, insertions: readonly [marker: string, line: string][], file: string, wired: boolean): string {
  const lines = text.split("\n");
  for (const [marker] of insertions) markerIndex(lines, marker, file);
  if (wired) return text;
  for (const [marker, line] of insertions) {
    if (lines.some((candidate) => candidate.trim() === line)) continue;
    const index = markerIndex(lines, marker, file);
    const indent = /^\s*/.exec(lines[index] ?? "")?.[0] ?? "";
    lines.splice(index, 0, `${indent}${line}`);
  }
  return lines.join("\n");
}

/** Whether `text` has an import (or export) from `specifier`, exactly. */
function importsFrom(text: string, specifier: string): boolean {
  const quoted = specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`\\bfrom\\s*["']${quoted}["']`).test(text);
}

function planHost(workspace: string, hostDir: string, names: TemplateNames): HostPlan {
  const host = resolve(workspace, hostDir);
  if (!isInside(workspace, host)) {
    throw new Error(`--host ${hostDir}: expected a folder inside the workspace, such as apps/api`);
  }
  const hostPath = relative(workspace, host);
  const missing = Object.values(HOST_FILES).filter((file) => !existsSync(join(host, file)));
  if (missing.length > 0) {
    throw new Error(
      `--host ${hostDir} is not a GYOS host (templates/apps/api): it has no ${missing.join(", ")}`,
    );
  }
  const { kebab, camel, pascal } = names.module;
  if (RESERVED_IDENTIFIERS.has(camel)) {
    throw new Error(`"${kebab}" can't be added to a host: "${camel}" is a reserved name there`);
  }

  const read = (file: string): string => readFileSync(join(host, file), "utf8");
  const where = (file: string): string => join(hostPath, file);
  const writes = new Map<string, string>();
  const keep = (file: string, before: string, after: string): void => {
    if (after !== before) writes.set(where(file), after);
  };

  // package.json: the dependency, in alphabetical order.
  const packageText = read(HOST_FILES.packageJson);
  const packageJson = JSON.parse(packageText) as { dependencies?: Record<string, string> };
  const dependencies = { ...packageJson.dependencies, [`@module/${kebab}`]: "workspace:*" };
  packageJson.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  keep(HOST_FILES.packageJson, packageText, `${JSON.stringify(packageJson, null, 2)}\n`);

  // src/modules.ts: built once, with the host's pool, logger and clock. A file that already
  // imports the module has it: none of its lines is added again.
  const modulesText = read(HOST_FILES.modules);
  const modules = insertAbove(
    modulesText,
    [
      [MARKERS.modulesImports, `import { create${pascal}Module, type ${pascal}Module } from "@module/${kebab}";`],
      [MARKERS.modulesType, `${camel}: ${pascal}Module;`],
      [MARKERS.modulesBuild, `const ${camel} = create${pascal}Module({ db: pool, logger, clock });`],
      [MARKERS.modulesReturn, `${camel},`],
    ],
    where(HOST_FILES.modules),
    importsFrom(modulesText, `@module/${kebab}`),
  );
  keep(HOST_FILES.modules, modulesText, modules);

  // src/http/routes/index.ts: the module's routes at /<name>, unless it imports them already.
  const routesText = read(HOST_FILES.routes);
  const routes = insertAbove(
    routesText,
    [
      [MARKERS.routesImports, `import { create${pascal}Routes } from "./${kebab}.ts";`],
      [MARKERS.routesMount, `router.use("/${kebab}", create${pascal}Routes(modules.${camel}));`],
    ],
    where(HOST_FILES.routes),
    importsFrom(routesText, `./${kebab}.ts`),
  );
  keep(HOST_FILES.routes, routesText, routes);

  // The route file and its test, rendered like the module. One that exists is the team's now.
  const kept: string[] = [];
  const rendered: string[] = [];
  for (const { file, path } of templateFiles(HOST_TEMPLATE_DIR)) {
    const target = renderPath(file, names);
    if (existsSync(join(host, target))) {
      kept.push(where(target));
    } else {
      writes.set(where(target), renderText(file, readFileSync(path, "utf8"), names));
      rendered.push(where(target));
    }
  }
  return { host: hostPath, writes, kept, rendered };
}

function applyPlan(workspace: string, plan: HostPlan): void {
  for (const [file, text] of plan.writes) {
    const path = join(workspace, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

// --- The command ----------------------------------------------------------------------------

const USAGE =
  "usage: node scripts/new-module.ts <workspace-dir> <name> [--area <plural> --entity <singular>] [--host <dir>]";

interface Options {
  workspaceDir: string;
  name: string;
  area?: string;
  entity?: string;
  host?: string;
}

function parseArgs(args: readonly string[]): Options | string {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const hints: Record<string, string> = {
    "--host": "a folder, such as apps/api",
    "--area": "the area's name, plural and kebab-case, such as treatment-plans",
    "--entity": "the entity's name, singular and kebab-case, such as treatment-plan",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const hint = hints[arg];
    if (hint !== undefined) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) return `${arg} needs ${hint}`;
      flags[arg] = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      return `unknown option ${arg}`;
    } else {
      positional.push(arg);
    }
  }
  const [workspaceDir, name] = positional;
  if (positional.length !== 2 || workspaceDir === undefined || name === undefined) return "expected a workspace and a name";
  const { "--area": area, "--entity": entity, "--host": host } = flags;
  if ((area === undefined) !== (entity === undefined)) return "--area and --entity go together";
  return {
    workspaceDir,
    name,
    ...(area === undefined ? {} : { area }),
    ...(entity === undefined ? {} : { entity }),
    ...(host === undefined ? {} : { host }),
  };
}

function main(args: readonly string[]): void {
  const options = parseArgs(args);
  if (typeof options === "string") {
    console.error(`${options}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const names: TemplateNames = {
    module: formsOf(options.name),
    area: formsOf(options.area ?? TEMPLATE_AREA),
    entity: formsOf(options.entity ?? TEMPLATE_ENTITY),
  };
  const templates = templateFiles(TEMPLATE_DIR);
  const problems = [...validateName(options.name), ...validateArea(names, templates)];
  if (problems.length === 0) {
    problems.push(...pathClashes(templates, names), ...pathClashes(templateFiles(HOST_TEMPLATE_DIR), names));
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const workspace = resolveWorkspace(options.workspaceDir);
  const { module, area, entity } = names;
  const target = join(workspace, "modules", module.kebab);
  const exists = existsSync(target);
  if (exists && options.host === undefined) throw new Error(`${target} already exists`);

  // Everything the host needs is checked before the first file is written.
  const plan = options.host === undefined ? undefined : planHost(workspace, options.host, names);
  // A module that exists has its own area: routes rendered for another wouldn't compile.
  if (exists && plan !== undefined && plan.rendered.length > 0) {
    const mismatch = areaMismatch(workspace, names);
    if (mismatch !== undefined) throw new Error(mismatch);
  }

  if (exists) {
    console.log(`@module/${module.kebab} already exists in modules/${module.kebab}: adding it to the host only.`);
  } else {
    const created = scaffoldModule(workspace, templates, names);
    console.log(
      `Created @module/${module.kebab} in modules/${module.kebab} (${created.length} files): ` +
        `schema "${module.kebab}", create${module.pascal}Module(), area ${area.kebab} (${entity.pascal}).`,
    );
  }
  if (plan !== undefined) {
    applyPlan(workspace, plan);
    const changed = [...plan.writes.keys()];
    console.log(
      changed.length === 0
        ? `${plan.host} already has @module/${module.kebab}: nothing to change.`
        : `Added @module/${module.kebab} to ${plan.host}, routes at /${module.kebab}: ${changed.join(", ")}.`,
    );
    if (plan.kept.length > 0 && changed.length > 0) {
      console.log(`  Kept as they were: ${plan.kept.join(", ")}.`);
    }
  }
  if (exists) return;
  console.log(
    [
      "",
      "Next:",
      "  1. pnpm install, then pnpm typecheck and pnpm test.",
      `  2. The ${area.kebab} area is an example: src/${area.kebab}/, src/${area.kebab}-vocabulary.ts (the "./${area.kebab}"`,
      `     export), features/${area.kebab}.feature and their tests. Make it this module's own, or replace it.`,
      ...(plan === undefined
        ? []
        : [`     So are its routes in ${plan.host}/src/http/routes/${module.kebab}.ts, and their test.`]),
      `  3. Before the first deploy, delete modules/${module.kebab}/drizzle/ and run`,
      `     pnpm --filter @module/${module.kebab} db:generate: the shipped 0000_init migration creates`,
      `     "${module.kebab}".${area.snake}, and once deployed, migrations are expand-only.`,
      `See modules/${module.kebab}/README.md.`,
    ].join("\n"),
  );
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
