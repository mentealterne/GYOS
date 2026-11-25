// Proves the templates: builds a throwaway product from them and runs every check on it.
//
//   DATABASE_URL=postgres://user@localhost:5432/postgres node scripts/verify-templates.ts [--keep] [--no-db]
//
// In a temp directory it copies templates/workspace, adds tooling/architecture and the host
// (templates/apps/api), scaffolds two modules into both with scripts/new-module.ts --host, installs,
// and runs typecheck, build, the unit and architecture tests, the scenarios, Turborepo's cache
// invalidation (a change outside a package must not replay a cached pass), a consumer of the
// modules' build, drizzle-kit check and generate (which must find nothing to do), the host from
// source and from the build with HTTP requests against it and a graceful stop, db:migrate and the
// integration tests.
//
// DATABASE_URL must reach a Postgres where the user may create databases: the database steps run
// in a new database, gyos_verify_<time>_<pid>, created here and dropped at the end, so they start
// from an empty database. The integration tests get it as TEST_DATABASE_URL.
// --no-db skips them (reported as skipped). --keep keeps the temp directory.
// No dependencies. Runs with Node's type stripping (Node 24).
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
// The second name has two words, so every run re-checks what the standard claims for them: a
// quoted schema ("case-management"), PascalCase and UPPER_SNAKE identifiers, a camelCase field
// in the host.
const MODULES = ["billing", "case-management"] as const;
/** Where the host is, in the workspace: what /gyos:init scaffolds, and what --host names. */
const HOST = "apps/api";
/** The path of each module's example area under its routes: /<module>/<area>. */
const AREAS: Record<(typeof MODULES)[number], string> = { billing: "items", "case-management": "items" };

const flags = new Set(process.argv.slice(2));
const keep = flags.has("--keep");
const withDatabase = !flags.has("--no-db");

interface Result {
  step: string;
  status: "passed" | "failed" | "skipped";
  seconds: number;
}

const results: Result[] = [];
const root = mkdtempSync(join(tmpdir(), "gyos-verify-"));
const host = join(root, HOST);
const databaseName = `gyos_verify_${Date.now()}_${process.pid}`;
let databaseUrl: string | undefined;
const baseEnv: NodeJS.ProcessEnv = { ...process.env, TURBO_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };

function record(step: string, ok: boolean, started: number): boolean {
  results.push({ step, status: ok ? "passed" : "failed", seconds: (performance.now() - started) / 1000 });
  return ok;
}

function run(step: string, command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): boolean {
  console.log(`\n▶ ${step}\n  $ ${[command, ...args].join(" ")}`);
  const started = performance.now();
  const outcome = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...baseEnv, ...options.env },
    stdio: "inherit",
  });
  if (outcome.error !== undefined) console.error(`  ${outcome.error.message}`);
  return record(step, outcome.status === 0, started);
}

/** Runs a command that must fail; when `output` is given, its output must match it too. */
function runExpectingFailure(
  step: string,
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; output?: RegExp } = {},
): boolean {
  console.log(`\n▶ ${step} (must fail)\n  $ ${[command, ...args].join(" ")}`);
  const started = performance.now();
  const outcome = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...baseEnv, ...options.env },
    encoding: "utf8",
  });
  const output = `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`;
  console.log(output.split("\n").slice(-25).join("\n"));
  const failed = outcome.status !== 0 && outcome.error === undefined;
  const matched = options.output === undefined || options.output.test(output);
  if (!failed) console.error("  It succeeded.");
  if (failed && !matched) console.error(`  It failed, but its output doesn't match ${String(options.output)}.`);
  return record(step, failed && matched, started);
}

function skip(step: string): void {
  results.push({ step, status: "skipped", seconds: 0 });
}

/**
 * Turborepo must not replay a pass when something the task reads has changed outside its own
 * package: a dependency's source, which a dependent typechecks through @gyos/source, or a module
 * that tooling/architecture reads from disk. After a first run has filled the cache, each case
 * breaks one file, expects the task to fail, then restores the file and expects it to pass.
 */
function checkCacheInvalidation(): boolean {
  const [first, second] = MODULES;
  const cases = [
    {
      step: "cache: a dependency's change reaches the host's typecheck",
      file: join(root, "modules", first, "src", "index.ts"),
      edit: (text: string) =>
        text.replace(/(export function create\w+Module\(input: \w+ModuleConfig)\)/, "$1, broken: number)"),
      args: ["exec", "turbo", "run", "typecheck", "--filter", "api"],
      output: /TS2554/,
    },
    {
      step: "cache: a module's change reaches tooling/architecture",
      file: join(root, "modules", second, "src", "db", "migrate.ts"),
      edit: (text: string) =>
        text.replace(/export const MIGRATIONS_TABLE = "[^"]+";/, `export const MIGRATIONS_TABLE = "__migrations_${first}";`),
      args: ["exec", "turbo", "run", "test:unit", "--filter", "@tooling/architecture"],
      output: /bookkeeping/,
    },
  ];
  for (const { step, file, edit, args, output } of cases) {
    const original = readFileSync(file, "utf8");
    const broken = edit(original);
    if (broken === original) {
      console.error(`\n${step}: the edit didn't apply to ${file}`);
      results.push({ step, status: "failed", seconds: 0 });
      return false;
    }
    writeFileSync(file, broken);
    let caught: boolean;
    try {
      caught = runExpectingFailure(step, "pnpm", args, { output });
    } finally {
      writeFileSync(file, original);
    }
    if (!caught || !run(`${step}, restored`, "pnpm", args)) return false;
  }
  return true;
}

const journalLength = (moduleDir: string): number =>
  (JSON.parse(readFileSync(join(moduleDir, "drizzle", "meta", "_journal.json"), "utf8")) as { entries: unknown[] })
    .entries.length;

/** drizzle-kit generate must find nothing to do: the shipped migrations match src/db/schema.ts. */
function checkMigrationsMatchSchema(): boolean {
  if (!run("db:generate", "pnpm", ["--recursive", "--filter", "@module/*", "run", "db:generate"])) return false;
  const expected = journalLength(join(REPO, "templates", "module"));
  const stale = MODULES.filter((name) => journalLength(join(root, "modules", name)) !== expected);
  if (stale.length > 0) {
    console.error(`  db:generate wrote a new migration for ${stale.join(", ")}: the template's drizzle/ is stale.`);
  }
  results.push({ step: "migrations match schema", status: stale.length === 0 ? "passed" : "failed", seconds: 0 });
  return stale.length === 0;
}

/**
 * What only this verification needs, written into the host's folder because its dependencies are
 * installed there (none of it is part of the template): a tsconfig that checks GYOS's own scripts,
 * the script that creates and drops the run's database, and a consumer of the modules' build.
 */
function writeVerificationFiles(): void {
  const dir = join(host, "verify");
  mkdirSync(dir, { recursive: true });
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  // GYOS's own scripts, checked with the workspace's TypeScript 7 and Node types.
  writeFileSync(
    join(host, "tsconfig.gyos-scripts.json"),
    json({
      extends: "../../tsconfig.base.json",
      compilerOptions: { noEmit: true, allowImportingTsExtensions: true, typeRoots: ["./node_modules/@types"] },
      files: ["new-module.ts", "verify-templates.ts"].map((file) => join(REPO, "scripts", file)),
    }),
  );
  // The consumer resolves the modules through `types` (their dist .d.ts), and checks those
  // declarations too: no @gyos/source condition, no skipLibCheck.
  writeFileSync(
    join(host, "tsconfig.verify-consumer.json"),
    json({
      extends: "../../tsconfig.base.json",
      compilerOptions: { noEmit: true, allowImportingTsExtensions: true, customConditions: [], skipLibCheck: false },
      files: ["verify/consumer.ts"],
    }),
  );
  writeFileSync(
    join(dir, "consumer.ts"),
    `// A consumer of the first module's entry points, vocabulary subpath included: typechecked against
// the build's declarations, then run from the build and from source.
import type { BillingModule } from "@module/billing";
import { ITEM_NAME_MAX_LENGTH } from "@module/billing/items";

declare const billing: BillingModule;
// Never called: it proves the build's types are real, not any.
// @ts-expect-error: the tenant id is a string.
const typesAreReal = () => billing.items.list(42);
void typesAreReal;

console.log(\`consumer: ok (names up to \${ITEM_NAME_MAX_LENGTH} characters, from \${import.meta.resolve("@module/billing/items").includes("/dist/") ? "the build" : "source"})\`);
`,
  );
  writeFileSync(
    join(dir, "database.mjs"),
    `// node verify/database.mjs create|drop <name>: a database for one verification run.
import pg from "pg";

const [action, name] = process.argv.slice(2);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const quoted = client.escapeIdentifier(name);
  await client.query(action === "create" ? \`create database \${quoted}\` : \`drop database if exists \${quoted} with (force)\`);
} finally {
  await client.end();
}
`,
  );
}

interface Check {
  name: string;
  method: string;
  path: string;
  json?: unknown;
  tenant?: boolean;
  status: number;
  /** What else the response must show; returns a problem, or undefined. */
  expect?: (body: unknown) => string | undefined;
}

const errorCode = (body: unknown): unknown => (body as { error?: { code?: unknown } } | undefined)?.error?.code;
const itemsOf = (body: unknown): unknown[] => ((body as { items?: unknown[] } | undefined)?.items ?? []) as unknown[];

/** The requests made to the running host, in order. */
function smokeChecks(): Check[] {
  const [first, second] = MODULES;
  const firstItems = `/${first}/${AREAS[first]}`;
  const secondItems = `/${second}/${AREAS[second]}`;
  const name = "Blue widget";
  return [
    { name: "liveness", method: "GET", path: "/health", status: 200 },
    { name: "readiness", method: "GET", path: "/ready", status: 200 },
    { name: "create", method: "POST", path: firstItems, json: { name }, tenant: true, status: 201 },
    {
      name: "a refusal, mapped",
      method: "POST",
      path: firstItems,
      json: { name },
      tenant: true,
      status: 409,
      expect: (body) => (errorCode(body) === "duplicate-name" ? undefined : `code ${String(errorCode(body))}`),
    },
    {
      name: "invalid input",
      method: "POST",
      path: firstItems,
      json: { name: "" },
      tenant: true,
      status: 400,
      expect: (body) => (errorCode(body) === "invalid-input" ? undefined : `code ${String(errorCode(body))}`),
    },
    {
      name: "list",
      method: "GET",
      path: firstItems,
      tenant: true,
      status: 200,
      expect: (body) => (itemsOf(body).length === 1 ? undefined : `${itemsOf(body).length} items, expected 1`),
    },
    {
      name: "each module sees only its own schema",
      method: "GET",
      path: secondItems,
      tenant: true,
      status: 200,
      expect: (body) => (itemsOf(body).length === 0 ? undefined : `${itemsOf(body).length} items, expected 0`),
    },
    {
      name: "not found",
      method: "PATCH",
      path: `${firstItems}/${randomUUID()}`,
      json: { name },
      tenant: true,
      status: 404,
    },
    { name: "no such route", method: "GET", path: "/nowhere", status: 404 },
  ];
}

/**
 * Starts the host as a deploy would (port chosen by the system, JSON logs), waits for its
 * "listening" line, makes the requests in smokeChecks(), then stops it with SIGTERM, and expects
 * it to log "stopped" and exit with 0.
 */
async function runHost(step: string, args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  console.log(`\n▶ ${step}\n  $ node ${args.join(" ")}`);
  const started = performance.now();
  const child = spawn(process.execPath, args, {
    cwd: host,
    env: { ...baseEnv, ...env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "0", LOG_LEVEL: "info" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const lines: Record<string, unknown>[] = [];
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  const listening = new Promise<number>((resolve, reject) => {
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const complete = buffer.split("\n");
      buffer = complete.pop() ?? "";
      for (const line of complete) {
        console.log(`  ${line}`);
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          lines.push(entry);
          if (entry.msg === "listening" && typeof entry.port === "number") resolve(entry.port);
        } catch {
          // Not a log line.
        }
      }
    });
    void exited.then((code) => reject(new Error(`it exited with ${String(code)} before listening`)));
    setTimeout(() => reject(new Error("it was not listening after 60 s")), 60_000).unref();
  });

  const problems: string[] = [];
  try {
    const port = await listening;
    const tenant = { "x-tenant-id": `tenant-${randomUUID()}` };
    for (const check of smokeChecks()) {
      const response = await fetch(`http://127.0.0.1:${port}${check.path}`, {
        method: check.method,
        headers: { ...(check.json === undefined ? {} : { "content-type": "application/json" }), ...(check.tenant ? tenant : {}) },
        body: check.json === undefined ? undefined : JSON.stringify(check.json),
      });
      const text = await response.text();
      const body: unknown = text === "" ? undefined : JSON.parse(text);
      const problem =
        response.status !== check.status ? `status ${response.status}, expected ${check.status}` : check.expect?.(body);
      console.log(`  ${problem === undefined ? "ok  " : "FAIL"} ${check.name}: ${check.method} ${check.path} → ${response.status}`);
      if (problem !== undefined) problems.push(`${check.name}: ${problem} (${text})`);
    }
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  } finally {
    child.kill("SIGTERM");
  }
  const code = await Promise.race([exited, new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 30_000).unref())]);
  if (code === "hung") {
    child.kill("SIGKILL");
    problems.push("it didn't exit within 30 s of SIGTERM");
  } else if (code !== 0) {
    problems.push(`it exited with ${String(code)} after SIGTERM`);
  } else if (!lines.some((line) => line.msg === "stopped")) {
    problems.push('it exited without logging "stopped"');
  }
  for (const problem of problems) console.error(`  ${problem}`);
  return record(step, problems.length === 0, started);
}

async function verify(): Promise<void> {
  console.log(`GYOS template verification in ${root}`);
  cpSync(join(REPO, "templates", "workspace"), root, { recursive: true });
  cpSync(join(REPO, "templates", "tooling-architecture"), join(root, "tooling", "architecture"), { recursive: true });
  cpSync(join(REPO, "templates", "apps", "api"), host, { recursive: true });
  for (const name of MODULES) {
    const args = [join(REPO, "scripts", "new-module.ts"), root, name, "--host", HOST];
    if (!run(`scaffold ${name}`, process.execPath, args)) return;
  }
  // Running it again for a module already there changes nothing in the host.
  const hostFiles = ["package.json", "src/modules.ts", "src/http/routes/index.ts"].map((file) => join(host, file));
  const wired = hostFiles.map((file) => readFileSync(file, "utf8"));
  const again = [join(REPO, "scripts", "new-module.ts"), root, MODULES[0], "--host", HOST];
  if (!run(`scaffold ${MODULES[0]} again`, process.execPath, again)) return;
  const unchanged = hostFiles.every((file, index) => readFileSync(file, "utf8") === wired[index]);
  if (!unchanged) console.error(`  The second run changed ${HOST}.`);
  results.push({ step: "scaffold again: the host is unchanged", status: unchanged ? "passed" : "failed", seconds: 0 });
  if (!unchanged) return;
  // A host whose marker is missing is refused before anything is written, the module included.
  const modulesFile = join(host, "src", "modules.ts");
  const withMarkers = readFileSync(modulesFile, "utf8");
  writeFileSync(modulesFile, withMarkers.replace("// gyos:modules:build", ""));
  let refusedHost: boolean;
  try {
    refusedHost = runExpectingFailure(
      "scaffold refuses a host without its markers",
      process.execPath,
      [join(REPO, "scripts", "new-module.ts"), root, "refused", "--host", HOST],
      { output: /expected the marker "\/\/ gyos:modules:build" once, found it 0 times/ },
    );
  } finally {
    writeFileSync(modulesFile, withMarkers);
  }
  if (!refusedHost) return;
  if (existsSync(join(root, "modules", "refused"))) {
    console.error("  It refused the host, but scaffolded the module first.");
    results.push({ step: "scaffold refuses a host: nothing written", status: "failed", seconds: 0 });
    return;
  }
  writeVerificationFiles();

  if (!run("install", "pnpm", ["install", "--no-frozen-lockfile"])) return;
  for (const task of ["typecheck", "build", "test:unit", "test:scenarios"]) {
    if (!run(task, "pnpm", ["run", task])) return;
  }
  if (!checkCacheInvalidation()) return;
  if (!run("typecheck GYOS scripts", "pnpm", ["exec", "tsc", "-p", "tsconfig.gyos-scripts.json"], { cwd: host })) {
    return;
  }
  // A consumer of the modules' build: their declarations typecheck without skipLibCheck, their
  // types are real, and every entry point runs from dist/ and from src/.
  if (!run("consumer: types against the build", "pnpm", ["exec", "tsc", "-p", "tsconfig.verify-consumer.json"], { cwd: host })) {
    return;
  }
  if (!run("consumer: from the build", process.execPath, ["verify/consumer.ts"], { cwd: host })) return;
  if (!run("consumer: from source", process.execPath, ["--conditions=@gyos/source", "verify/consumer.ts"], { cwd: host })) {
    return;
  }
  if (!run("db:check", "pnpm", ["--recursive", "--filter", "@module/*", "run", "db:check"])) return;
  if (!checkMigrationsMatchSchema()) return;

  const refusers = ["@module/billing", "api"];
  const refusal = (pkg: string) => `test:integration of ${pkg} refuses a database not named for tests`;
  const databaseSteps = ["host from source", "host from build", "db:migrate", ...refusers.map(refusal), "test:integration"];
  const adminUrl = process.env.DATABASE_URL;
  if (!withDatabase) {
    databaseSteps.forEach(skip);
    return;
  }
  if (adminUrl === undefined || adminUrl === "") {
    console.error("\nDATABASE_URL is not set: the database steps need a Postgres (or pass --no-db).");
    results.push({ step: "database", status: "failed", seconds: 0 });
    return;
  }
  if (!run("create database", process.execPath, ["verify/database.mjs", "create", databaseName], { cwd: host, env: { DATABASE_URL: adminUrl } })) {
    return;
  }
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  databaseUrl = url.toString();
  const env = { DATABASE_URL: databaseUrl };

  // Both modules migrate at once on an empty database, from source through the workspace symlinks.
  if (!(await runHost("host from source", ["--conditions=@gyos/source", "src/main.ts"], env))) return;
  if (!(await runHost("host from build", ["dist/main.js"], env))) return;
  if (!run("db:migrate", "pnpm", ["--recursive", "--filter", "@module/*", "run", "db:migrate"], { env })) return;
  // The integration tests wipe schemas, or whole databases: they read TEST_DATABASE_URL, not
  // DATABASE_URL, and refuse a database whose name doesn't contain "test" or "verify".
  const notForTests = new URL(adminUrl);
  notForTests.pathname = "/postgres";
  for (const pkg of refusers) {
    const refused = runExpectingFailure(refusal(pkg), "pnpm", ["--filter", pkg, "run", "test:integration"], {
      env: { TEST_DATABASE_URL: notForTests.toString() },
      output: /only run on a database whose name contains/,
    });
    if (!refused) return;
  }
  run("test:integration", "pnpm", ["run", "test:integration"], { env: { TEST_DATABASE_URL: databaseUrl } });
}

try {
  await verify();
} catch (error) {
  console.error(error);
  results.push({ step: "verification script", status: "failed", seconds: 0 });
} finally {
  if (databaseUrl !== undefined && process.env.DATABASE_URL !== undefined) {
    run("drop database", process.execPath, ["verify/database.mjs", "drop", databaseName], {
      cwd: host,
      env: { DATABASE_URL: process.env.DATABASE_URL },
    });
  }
}

const failed = results.some((result) => result.status === "failed");
console.log("\nSummary");
for (const { step, status, seconds } of results) {
  console.log(`  ${status === "passed" ? "PASS" : status === "failed" ? "FAIL" : "SKIP"}  ${step.padEnd(24)} ${seconds.toFixed(1)}s`);
}
console.log(`\n${results.filter((result) => result.status === "passed").length} passed, ` +
  `${results.filter((result) => result.status === "failed").length} failed, ` +
  `${results.filter((result) => result.status === "skipped").length} skipped`);
if (failed || keep) {
  console.log(`\nThe workspace is kept in ${root}`);
} else {
  rmSync(root, { recursive: true, force: true });
}
console.log(
  failed
    ? "\nTemplates: FAILED"
    : withDatabase
      ? "\nTemplates: verified"
      : "\nTemplates: verified, without the database steps",
);
process.exitCode = failed ? 1 : 0;
