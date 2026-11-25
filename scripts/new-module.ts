// Scaffolds a domain module from templates/module, deterministically, and can add it to a host.
//
//   node scripts/new-module.ts <workspace-dir> <name> [--host <dir>]
//
// Copies the template to <workspace-dir>/modules/<name> and renames its three tokens, in paths and
// in contents, with a plain case-sensitive replace:
//   sample → the kebab-case name: package, Postgres schema, folders, strings;
//   Sample → its PascalCase form: types and functions;
//   SAMPLE → its UPPER_SNAKE form: constants.
// The migration lock key is left as it is: it is the same in every module of a workspace.
// It renames only the module: the example area, items, and its first migration come along, and
// the output says what to replace before the first deploy.
//
// --host <dir> (a path in the workspace, such as apps/api) also adds the module to that host,
// built from templates/apps/api:
//   - "@module/<name>": "workspace:*" in the host's package.json dependencies;
//   - an import, a field of Modules, a build line and a return line in src/modules.ts;
//   - an import and a mount in src/http/routes/index.ts, the module's routes at /<name>;
//   - src/http/routes/<name>.ts and its test, rendered from templates/host-module like the module.
// Each line goes right above its gyos:* marker. The host is checked before anything is written:
// a marker missing, or found twice, refuses the whole run. Running it again changes nothing: a
// line already present is not added twice, a route file already there is kept as it is, and a
// module that exists is not scaffolded again (with --host only; without it, that is an error).
// No dependencies. Runs with Node's type stripping (Node 24), so erasable syntax only.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = fileURLToPath(new URL("../templates/module/", import.meta.url));
const HOST_TEMPLATE_DIR = fileURLToPath(new URL("../templates/host-module/", import.meta.url));

/** kebab-case, starting with a letter. */
const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** Postgres identifiers are at most 63 bytes, and the bookkeeping table is __migrations_<name>. */
const MAX_NAME_LENGTH = 40;
/** Schemas a module can't own: the default one, and the shared migration bookkeeping. */
const RESERVED_NAMES = new Set(["public", "drizzle"]);
/**
 * Names a host can't give a module's variable: JavaScript's reserved words, and the names
 * src/modules.ts and src/http/routes/index.ts already use.
 */
const RESERVED_IDENTIFIERS = new Set([
  ..."break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await".split(" "),
  "pool",
  "logger",
  "clock",
  "modules",
  "router",
]);
/** Never copied from the template. */
const SKIPPED = new Set(["node_modules", "dist", "reports", ".turbo", "coverage", ".DS_Store"]);

interface ModuleNames {
  kebab: string;
  camel: string;
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
  const capitalised = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return {
    kebab,
    camel: [words[0] ?? "", ...capitalised.slice(1)].join(""),
    pascal: capitalised.join(""),
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

function resolveWorkspace(workspaceDir: string): string {
  const workspace = resolve(workspaceDir);
  if (!existsSync(join(workspace, "pnpm-workspace.yaml"))) {
    throw new Error(`${workspace} is not a workspace: it has no pnpm-workspace.yaml`);
  }
  return workspace;
}

function scaffoldModule(workspace: string, names: ModuleNames): string[] {
  const target = join(workspace, "modules", names.kebab);
  const created: string[] = [];
  for (const source of templateFiles(TEMPLATE_DIR)) {
    const destination = join(target, rename(relative(TEMPLATE_DIR, source), names));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, rename(readFileSync(source, "utf8"), names));
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
}

/**
 * The text with `line` inserted right above the line that holds `marker`, at its indentation.
 * The marker must be there exactly once. When the line is already in the file, nothing changes.
 */
function insertAbove(text: string, marker: string, line: string, file: string): string {
  const lines = text.split("\n");
  const at = lines.flatMap((candidate, index) => (candidate.trim() === marker ? [index] : []));
  const [index] = at;
  if (at.length !== 1 || index === undefined) {
    throw new Error(`${file}: expected the marker "${marker}" once, found it ${at.length} times`);
  }
  if (lines.some((candidate) => candidate.trim() === line)) return text;
  const indent = /^\s*/.exec(lines[index] ?? "")?.[0] ?? "";
  lines.splice(index, 0, `${indent}${line}`);
  return lines.join("\n");
}

function planHost(workspace: string, hostDir: string, names: ModuleNames): HostPlan {
  const host = resolve(workspace, hostDir);
  const hostPath = relative(workspace, host);
  if (hostPath === "" || hostPath.startsWith("..") || hostPath.startsWith(sep)) {
    throw new Error(`--host ${hostDir}: expected a folder inside the workspace, such as apps/api`);
  }
  const missing = Object.values(HOST_FILES).filter((file) => !existsSync(join(host, file)));
  if (missing.length > 0) {
    throw new Error(
      `--host ${hostDir} is not a GYOS host (templates/apps/api): it has no ${missing.join(", ")}`,
    );
  }
  if (RESERVED_IDENTIFIERS.has(names.camel)) {
    throw new Error(`"${names.kebab}" can't be added to a host: "${names.camel}" is a reserved name there`);
  }

  const read = (file: string): string => readFileSync(join(host, file), "utf8");
  const where = (file: string): string => join(hostPath, file);
  const { kebab, camel, pascal } = names;
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

  // src/modules.ts: built once, with the host's pool, logger and clock.
  const modulesText = read(HOST_FILES.modules);
  let modules = modulesText;
  modules = insertAbove(modules, MARKERS.modulesImports, `import { create${pascal}Module, type ${pascal}Module } from "@module/${kebab}";`, where(HOST_FILES.modules));
  modules = insertAbove(modules, MARKERS.modulesType, `${camel}: ${pascal}Module;`, where(HOST_FILES.modules));
  modules = insertAbove(modules, MARKERS.modulesBuild, `const ${camel} = create${pascal}Module({ db: pool, logger, clock });`, where(HOST_FILES.modules));
  modules = insertAbove(modules, MARKERS.modulesReturn, `${camel},`, where(HOST_FILES.modules));
  keep(HOST_FILES.modules, modulesText, modules);

  // src/http/routes/index.ts: the module's routes at /<name>.
  const routesText = read(HOST_FILES.routes);
  let routes = routesText;
  routes = insertAbove(routes, MARKERS.routesImports, `import { create${pascal}Routes } from "./${kebab}.ts";`, where(HOST_FILES.routes));
  routes = insertAbove(routes, MARKERS.routesMount, `router.use("/${kebab}", create${pascal}Routes(modules.${camel}));`, where(HOST_FILES.routes));
  keep(HOST_FILES.routes, routesText, routes);

  // The route file and its test, rendered like the module. One that exists is the team's now.
  const kept: string[] = [];
  for (const source of templateFiles(HOST_TEMPLATE_DIR)) {
    const file = rename(relative(HOST_TEMPLATE_DIR, source), names);
    if (existsSync(join(host, file))) kept.push(where(file));
    else writes.set(where(file), rename(readFileSync(source, "utf8"), names));
  }
  return { host: hostPath, writes, kept };
}

function applyPlan(workspace: string, plan: HostPlan): void {
  for (const [file, text] of plan.writes) {
    const path = join(workspace, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}

// --- The command ----------------------------------------------------------------------------

const USAGE = "usage: node scripts/new-module.ts <workspace-dir> <name> [--host <dir>]";

interface Options {
  workspaceDir: string;
  name: string;
  host?: string;
}

function parseArgs(args: readonly string[]): Options | string {
  const positional: string[] = [];
  let host: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--host") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) return "--host needs a folder, such as apps/api";
      host = value;
      index += 1;
    } else if (arg.startsWith("--")) {
      return `unknown option ${arg}`;
    } else {
      positional.push(arg);
    }
  }
  const [workspaceDir, name] = positional;
  if (positional.length !== 2 || workspaceDir === undefined || name === undefined) return "expected a workspace and a name";
  return host === undefined ? { workspaceDir, name } : { workspaceDir, name, host };
}

function main(args: readonly string[]): void {
  const options = parseArgs(args);
  if (typeof options === "string") {
    console.error(`${options}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const problems = validateName(options.name);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const workspace = resolveWorkspace(options.workspaceDir);
  const names = namesFor(options.name);
  const target = join(workspace, "modules", names.kebab);
  const exists = existsSync(target);
  if (exists && options.host === undefined) throw new Error(`${target} already exists`);

  // Everything the host needs is checked before the first file is written.
  const plan = options.host === undefined ? undefined : planHost(workspace, options.host, names);

  if (exists) {
    console.log(`@module/${names.kebab} already exists in modules/${names.kebab}: adding it to the host only.`);
  } else {
    const created = scaffoldModule(workspace, names);
    console.log(
      `Created @module/${names.kebab} in modules/${names.kebab} (${created.length} files): ` +
        `schema "${names.kebab}", create${names.pascal}Module().`,
    );
  }
  if (plan !== undefined) {
    applyPlan(workspace, plan);
    const changed = [...plan.writes.keys()];
    console.log(
      changed.length === 0
        ? `${plan.host} already has @module/${names.kebab}: nothing to change.`
        : `Added @module/${names.kebab} to ${plan.host}, routes at /${names.kebab}: ${changed.join(", ")}.`,
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
      "  2. The items area is an example: src/items/, src/items-vocabulary.ts (the \"./items\" export),",
      "     features/items.feature and their tests. Replace it with this module's own area.",
      ...(plan === undefined
        ? []
        : [`     So are its routes in ${plan.host}/src/http/routes/${names.kebab}.ts, and their test.`]),
      `  3. Before the first deploy, delete modules/${names.kebab}/drizzle/ and run`,
      `     pnpm --filter @module/${names.kebab} db:generate: the shipped 0000_init migration creates`,
      `     "${names.kebab}".items, and once deployed, migrations are expand-only.`,
      `See modules/${names.kebab}/README.md.`,
    ].join("\n"),
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
