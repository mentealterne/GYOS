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
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

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
});
