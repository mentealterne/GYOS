/**
 * scripts/new-module.ts against a throwaway workspace made from the templates, without installing
 * anything: what it writes into the host, and what it refuses. verify-templates.ts proves that
 * what it writes compiles and runs.
 * Run: node --test scripts/*.test.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { isInside } from "./new-module.ts";

const REPO = join(import.meta.dirname, "..");
const SCRIPT = join(REPO, "scripts", "new-module.ts");
const HOST = "apps/api";

let workspace: string;

function scaffold(...args: string[]): { status: number | null; output: string } {
  const outcome = spawnSync(process.execPath, [SCRIPT, workspace, ...args], { encoding: "utf8" });
  return { status: outcome.status, output: `${outcome.stdout}${outcome.stderr}` };
}

const hostFile = (file: string): string => join(workspace, HOST, file);
const read = (file: string): string => readFileSync(hostFile(file), "utf8");
/** How many lines, comments left out, contain `part`. */
const count = (text: string, part: string): number =>
  text.split("\n").filter((line) => !line.trim().startsWith("//") && line.includes(part)).length;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "gyos-new-module-"));
  cpSync(join(REPO, "templates", "workspace"), workspace, { recursive: true });
  cpSync(join(REPO, "templates", "apps", "api"), join(workspace, HOST), { recursive: true });
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

describe("new-module.ts --host", () => {
  it("wires a module into the host once", () => {
    assert.equal(scaffold("billing", "--host", HOST).status, 0);
    const modules = read("src/modules.ts");
    assert.equal(count(modules, 'from "@module/billing"'), 1);
    assert.equal(count(modules, "createBillingModule({"), 1);
    assert.equal(count(read("src/http/routes/index.ts"), 'router.use("/billing"'), 1);
    assert.ok(existsSync(hostFile("src/http/routes/billing.ts")));
  });

  it("adds nothing again once the module's lines were edited by hand", () => {
    assert.equal(scaffold("billing", "--host", HOST).status, 0);
    const modules = read("src/modules.ts")
      .replace(/^ {2}const billing = createBillingModule\(\{ db: pool, logger, clock \}\);$/m, "  const billing = createBillingModule({ db: pool, clock, logger });")
      .replace(/^ {2}billing: BillingModule;$/m, "  readonly billing: BillingModule;")
      .replace(/^ {4}billing,$/m, "    billing: billing,");
    assert.equal(count(modules, "createBillingModule({ db: pool, clock, logger })"), 1);
    assert.equal(count(modules, "readonly billing: BillingModule;"), 1);
    assert.equal(count(modules, "billing: billing,"), 1);
    const routes = read("src/http/routes/index.ts").replace(
      'router.use("/billing", createBillingRoutes(modules.billing));',
      'router.use("/billing", createBillingRoutes(modules.billing)); // invoices, credit notes',
    );
    writeFileSync(hostFile("src/modules.ts"), modules);
    writeFileSync(hostFile("src/http/routes/index.ts"), routes);

    const again = scaffold("billing", "--host", HOST);
    assert.equal(again.status, 0, again.output);
    assert.equal(read("src/modules.ts"), modules);
    assert.equal(read("src/http/routes/index.ts"), routes);
  });

  it("still refuses a host whose markers are broken, even for a module it has", () => {
    assert.equal(scaffold("billing", "--host", HOST).status, 0);
    writeFileSync(hostFile("src/modules.ts"), read("src/modules.ts").replace("// gyos:modules:type", ""));
    const again = scaffold("billing", "--host", HOST);
    assert.notEqual(again.status, 0);
    assert.match(again.output, /expected the marker "\/\/ gyos:modules:type" once, found it 0 times/);
  });

  it("refuses to render routes for another area than the module's own, and writes nothing", () => {
    assert.equal(scaffold("sales", "--area", "orders", "--entity", "order").status, 0);
    const before = ["package.json", "src/modules.ts", "src/http/routes/index.ts"].map(read);

    const refused = scaffold("sales", "--host", HOST);
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /exports "\.\/orders", not "\.\/items"/);
    assert.match(refused.output, /--area orders --entity/);
    const wrongEntity = scaffold("sales", "--area", "orders", "--entity", "purchase", "--host", HOST);
    assert.notEqual(wrongEntity.status, 0);
    assert.match(wrongEntity.output, /no createPurchaseInputSchema/);
    assert.deepEqual(["package.json", "src/modules.ts", "src/http/routes/index.ts"].map(read), before);
    assert.ok(!existsSync(hostFile("src/http/routes/sales.ts")));

    const added = scaffold("sales", "--area", "orders", "--entity", "order", "--host", HOST);
    assert.equal(added.status, 0, added.output);
    assert.match(read("src/http/routes/sales.ts"), /router\.get\("\/orders"/);
  });

  it("checks nothing about the area when the routes are there already", () => {
    assert.equal(scaffold("sales", "--area", "orders", "--entity", "order", "--host", HOST).status, 0);
    const again = scaffold("sales", "--host", HOST);
    assert.equal(again.status, 0, again.output);
    assert.match(again.output, /nothing to change/);
  });

  it("refuses a host outside the workspace", () => {
    const outside = scaffold("billing", "--host", "../elsewhere");
    assert.notEqual(outside.status, 0);
    assert.match(outside.output, /expected a folder inside the workspace/);
    assert.ok(!existsSync(join(workspace, "modules", "billing")));
  });
});

describe("new-module.ts: names it refuses", () => {
  for (const name of ["context", "doctor", "review"]) {
    it(`a module called ${name}: its skill would collide with the /${name} command`, () => {
      const refused = scaffold(name);
      assert.notEqual(refused.status, 0);
      assert.match(refused.output, new RegExp(`"${name}" is reserved: its domain skill would collide`));
      assert.ok(!existsSync(join(workspace, "modules", name)));
    });
  }

  for (const name of ["eval", "arguments"]) {
    it(`a module called ${name}, in a host: it can't be a variable in strict mode`, () => {
      const refused = scaffold(name, "--host", HOST);
      assert.notEqual(refused.status, 0);
      assert.match(refused.output, new RegExp(`"${name}" is a reserved name there`));
      assert.ok(!existsSync(join(workspace, "modules", name)));
    });

    it(`an area or an entity called ${name}`, () => {
      const asEntity = scaffold("sales", "--area", `${name}-list`, "--entity", name);
      assert.notEqual(asEntity.status, 0);
      assert.match(asEntity.output, new RegExp(`--entity "${name}" would clash with a name the template already uses: ${name}\\b`));
      const asArea = scaffold("sales", "--area", name, "--entity", `${name}-entry`);
      assert.notEqual(asArea.status, 0);
      assert.match(asArea.output, new RegExp(`--area "${name}" would clash with a name the template already uses: ${name}\\b`));
      assert.ok(!existsSync(join(workspace, "modules", "sales")));
    });
  }

  it("the area the layer tests make up", () => {
    const refused = scaffold("sales", "--area", "other-area", "--entity", "other-thing");
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /the second area the layer tests make up/);
  });
});

describe("isInside", () => {
  it("knows a folder inside the workspace from one outside it, with POSIX paths", () => {
    assert.equal(isInside("/w", "/w/apps/api", posix), true);
    assert.equal(isInside("/w", "/w/..apps", posix), true);
    assert.equal(isInside("/w", "/w", posix), false);
    assert.equal(isInside("/w", "/elsewhere/api", posix), false);
    assert.equal(isInside("/w", "/", posix), false);
  });

  it("and with Windows paths, another drive included", () => {
    assert.equal(isInside("C:\\w", "C:\\w\\apps\\api", win32), true);
    assert.equal(isInside("C:\\w", "C:\\elsewhere\\api", win32), false);
    assert.equal(isInside("C:\\w", "D:\\w\\apps\\api", win32), false);
  });
});
