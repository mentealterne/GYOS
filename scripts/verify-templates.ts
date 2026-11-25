// Proves the templates: builds a throwaway product from them and runs every check on it.
//
//   DATABASE_URL=postgres://user@localhost:5432/postgres node scripts/verify-templates.ts [--keep] [--no-db]
//
// In a temp directory it copies templates/workspace, adds tooling/architecture, scaffolds two
// modules with scripts/new-module.ts, adds a small host (apps/smoke) that composes both, installs,
// and runs typecheck, build, the unit and architecture tests, the scenarios, Turborepo's cache
// invalidation (a change outside a package must not replay a cached pass), drizzle-kit check and
// generate (which must find nothing to do), the host from source and from the build, db:migrate
// and the integration tests.
//
// DATABASE_URL must reach a Postgres where the user may create databases: the database steps run
// in a new database, gyos_verify_<time>_<pid>, created here and dropped at the end, so they start
// from an empty database. The integration tests get it as TEST_DATABASE_URL.
// --no-db skips them (reported as skipped). --keep keeps the temp directory.
// No dependencies. Runs with Node's type stripping (Node 24).
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const MODULES = ["billing", "scheduling"] as const;

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
const databaseName = `gyos_verify_${Date.now()}_${process.pid}`;
let databaseUrl: string | undefined;
const baseEnv: NodeJS.ProcessEnv = { ...process.env, TURBO_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };

function run(step: string, command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): boolean {
  console.log(`\n▶ ${step}\n  $ ${[command, ...args].join(" ")}`);
  const started = performance.now();
  const outcome = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...baseEnv, ...options.env },
    stdio: "inherit",
  });
  const ok = outcome.status === 0;
  if (outcome.error !== undefined) console.error(`  ${outcome.error.message}`);
  results.push({ step, status: ok ? "passed" : "failed", seconds: (performance.now() - started) / 1000 });
  return ok;
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
  const ok = failed && matched;
  results.push({ step, status: ok ? "passed" : "failed", seconds: (performance.now() - started) / 1000 });
  return ok;
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
      args: ["exec", "turbo", "run", "typecheck", "--filter", "smoke"],
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

function writeSmokeHost(): void {
  const dir = join(root, "apps", "smoke");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(
    join(dir, "package.json"),
    json({
      name: "smoke",
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: { build: "tsc -p tsconfig.build.json", typecheck: "tsc --noEmit" },
      dependencies: { "@module/billing": "workspace:*", "@module/scheduling": "workspace:*", pg: "catalog:" },
      devDependencies: { "@types/node": "catalog:", "@types/pg": "catalog:", "@typescript/native": "catalog:" },
    }),
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    json({ extends: "../../tsconfig.base.json", compilerOptions: { noEmit: true }, include: ["src"] }),
  );
  // The build resolves the modules through `types` (their dist .d.ts), and checks those
  // declarations too: no @gyos/source condition, no skipLibCheck.
  writeFileSync(
    join(dir, "tsconfig.build.json"),
    json({
      extends: "../../tsconfig.base.json",
      compilerOptions: { rootDir: "./src", outDir: "./dist", customConditions: [], skipLibCheck: false },
      include: ["src"],
    }),
  );
  // GYOS's own scripts, checked with the workspace's TypeScript 7 and Node types.
  writeFileSync(
    join(dir, "tsconfig.gyos-scripts.json"),
    json({
      extends: "../../tsconfig.base.json",
      compilerOptions: { noEmit: true, allowImportingTsExtensions: true, typeRoots: ["./node_modules/@types"] },
      files: ["new-module.ts", "verify-templates.ts"].map((file) => join(REPO, "scripts", file)),
    }),
  );
  writeFileSync(
    join(dir, "src", "main.ts"),
    `// A host: the composition root. Builds the pool and the logger, builds every module once,
// awaits ready() for all of them at once (as a fresh deploy would), then calls them.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { BillingItemError, createBillingModule } from "@module/billing";
import type { BillingLogger } from "@module/billing/contracts";
import { ITEM_NAME_MAX_LENGTH } from "@module/billing/items";
import { createSchedulingModule } from "@module/scheduling";

const url = process.env.DATABASE_URL;
if (url === undefined) throw new Error("DATABASE_URL is not set");

const logger = (bindings: Record<string, unknown> = {}): BillingLogger => ({
  error: (message, fields) => console.error(JSON.stringify({ level: "error", ...bindings, ...fields, msg: String(message) })),
  warn: (message, fields) => console.error(JSON.stringify({ level: "warn", ...bindings, ...fields, msg: message })),
  info: (message, fields) => console.log(JSON.stringify({ level: "info", ...bindings, ...fields, msg: message })),
  debug: () => {},
  child: (more) => logger({ ...bindings, ...more }),
});

const pool = new pg.Pool({ connectionString: url });
try {
  const billing = createBillingModule({ db: pool, logger: logger() });
  const scheduling = createSchedulingModule({ db: pool, logger: logger() });
  await Promise.all([billing.ready(), scheduling.ready()]);

  const tenant = randomUUID();
  // Never called: it proves the module's types are real, not any.
  // @ts-expect-error: the tenant id is a string.
  const _typesAreReal = () => billing.items.list(42);
  await billing.items.create(tenant, { name: "Blue widget" });
  const refused = await billing.items.create(tenant, { name: "Blue widget" }).catch((error: unknown) => error);
  if (!(refused instanceof BillingItemError) || refused.code !== "duplicate-name") {
    throw new Error(\`expected a duplicate-name refusal, got \${String(refused)}\`);
  }
  const [billingItems, schedulingItems] = await Promise.all([billing.items.list(tenant), scheduling.items.list(tenant)]);
  if (billingItems.length !== 1 || schedulingItems.length !== 0) {
    throw new Error("each module should see only its own schema");
  }
  console.log(\`smoke: ok (names up to \${ITEM_NAME_MAX_LENGTH} characters, \${import.meta.url.includes("/dist/") ? "build" : "source"})\`);
} finally {
  await pool.end();
}
`,
  );
  writeFileSync(
    join(dir, "scripts", "database.mjs"),
    `// node scripts/database.mjs create|drop <name>: a database for one verification run.
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

function verify(): void {
  console.log(`GYOS template verification in ${root}`);
  cpSync(join(REPO, "templates", "workspace"), root, { recursive: true });
  cpSync(join(REPO, "templates", "tooling-architecture"), join(root, "tooling", "architecture"), { recursive: true });
  for (const name of MODULES) {
    if (!run(`scaffold ${name}`, process.execPath, [join(REPO, "scripts", "new-module.ts"), root, name])) return;
  }
  writeSmokeHost();

  if (!run("install", "pnpm", ["install", "--no-frozen-lockfile"])) return;
  for (const task of ["typecheck", "build", "test:unit", "test:scenarios"]) {
    if (!run(task, "pnpm", ["run", task])) return;
  }
  if (!checkCacheInvalidation()) return;
  const smoke = join(root, "apps", "smoke");
  if (!run("typecheck GYOS scripts", "pnpm", ["exec", "tsc", "-p", "tsconfig.gyos-scripts.json"], { cwd: smoke })) {
    return;
  }
  if (!run("db:check", "pnpm", ["--recursive", "--filter", "@module/*", "run", "db:check"])) return;
  if (!checkMigrationsMatchSchema()) return;

  const databaseSteps = [
    "host from source",
    "host from build",
    "db:migrate",
    "test:integration refuses a database not named for tests",
    "test:integration",
  ];
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
  if (!run("create database", process.execPath, ["scripts/database.mjs", "create", databaseName], { cwd: smoke, env: { DATABASE_URL: adminUrl } })) {
    return;
  }
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  databaseUrl = url.toString();
  const env = { DATABASE_URL: databaseUrl };

  // Both modules migrate at once on an empty database, from source through the workspace symlinks.
  if (!run("host from source", process.execPath, ["--conditions=@gyos/source", "src/main.ts"], { cwd: smoke, env })) return;
  if (!run("host from build", process.execPath, ["dist/main.js"], { cwd: smoke, env })) return;
  if (!run("db:migrate", "pnpm", ["--filter", "@module/billing", "run", "db:migrate"], { env })) return;
  // The integration tests wipe their module's schema: they read TEST_DATABASE_URL, not
  // DATABASE_URL, and refuse a database whose name doesn't contain "test" or "verify".
  const notForTests = new URL(adminUrl);
  notForTests.pathname = "/postgres";
  const refused = runExpectingFailure(
    "test:integration refuses a database not named for tests",
    "pnpm",
    ["--filter", "@module/billing", "run", "test:integration"],
    { env: { TEST_DATABASE_URL: notForTests.toString() }, output: /only run on a database whose name contains/ },
  );
  if (!refused) return;
  run("test:integration", "pnpm", ["run", "test:integration"], { env: { TEST_DATABASE_URL: databaseUrl } });
}

try {
  verify();
} catch (error) {
  console.error(error);
  results.push({ step: "verification script", status: "failed", seconds: 0 });
} finally {
  if (databaseUrl !== undefined && process.env.DATABASE_URL !== undefined) {
    run("drop database", process.execPath, ["scripts/database.mjs", "drop", databaseName], {
      cwd: join(root, "apps", "smoke"),
      env: { DATABASE_URL: process.env.DATABASE_URL },
    });
  }
}

const failed = results.some((result) => result.status === "failed");
console.log("\nSummary");
for (const { step, status, seconds } of results) {
  console.log(`  ${status === "passed" ? "PASS" : status === "failed" ? "FAIL" : "SKIP"}  ${step.padEnd(24)} ${seconds.toFixed(1)}s`);
}
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
