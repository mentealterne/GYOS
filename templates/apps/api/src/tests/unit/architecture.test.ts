// The host's own rule (standards/host.md): src/config.ts is the one file that reads the
// environment. Which modules the host imports, and through which entry points, is checked across
// the workspace by tooling/architecture.
//
// Imports are read with the TypeScript 6 API: TypeScript 7.0 ships no programmatic API, so
// "typescript" is aliased to @typescript/typescript6 (see pnpm-workspace.yaml).
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const ENVIRONMENT_READER = "config.ts";

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .map((path) => path.split(sep).join("/"))
  .filter((path) => path.endsWith(".ts") && !path.startsWith("tests/"))
  .map((path) => ({ path, text: readFileSync(join(SRC, path), "utf8") }));

const PROCESS_MODULES = new Set(["process", "node:process"]);
const isEnv = (name: ts.PropertyName | ts.ModuleExportName | undefined): boolean =>
  name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === "env";

/**
 * Whether a file reads the environment in a spelling this check knows: `process.env`,
 * `process["env"]`, `globalThis.process.env`, `const { env } = process`,
 * `import { env } from "node:process"`, or `.env` on a default or namespace import of
 * `node:process`. It reads the syntax only: an alias (`const p = process; p.env`), a computed key
 * or `require("process")` gets past it.
 */
function readsEnvironment(text: string): boolean {
  const source = ts.createSourceFile("file.ts", text, ts.ScriptTarget.Latest, true);
  const processNames = new Set(["process"]);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!PROCESS_MODULES.has(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (clause?.name !== undefined) processNames.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) processNames.add(bindings.name.text);
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      if (bindings.elements.some((element) => isEnv(element.propertyName ?? element.name))) return true;
    }
  }
  const isProcess = (expression: ts.Expression): boolean =>
    (ts.isIdentifier(expression) && processNames.has(expression.text)) ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      ["globalThis", "global"].includes(expression.expression.text) &&
      expression.name.text === "process");
  const visit = (node: ts.Node): boolean => {
    if (ts.isPropertyAccessExpression(node) && isProcess(node.expression) && node.name.text === "env") return true;
    if (
      ts.isElementAccessExpression(node) &&
      isProcess(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    ) {
      return true;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      isProcess(node.initializer) &&
      ts.isObjectBindingPattern(node.name) &&
      node.name.elements.some((element) =>
        isEnv(element.propertyName ?? (ts.isIdentifier(element.name) ? element.name : undefined)),
      )
    ) {
      return true;
    }
    return ts.forEachChild(node, visit) ?? false;
  };
  return visit(source);
}

describe("the host's source", () => {
  it("reads the environment in src/config.ts only", () => {
    const readers = sources.filter((file) => readsEnvironment(file.text)).map((file) => file.path);
    expect(readers).toEqual([ENVIRONMENT_READER]);
  });
});

describe("the check reports every spelling it knows", () => {
  it.each([
    "const url = process.env.DATABASE_URL;",
    'const url = process["env"].DATABASE_URL;',
    "const url = globalThis.process.env.DATABASE_URL;",
    "const { env } = process;",
    "const { env: environment } = process;",
    'import { env } from "node:process";',
    'import proc from "node:process"; const url = proc.env.DATABASE_URL;',
    'import * as proc from "process"; const url = proc.env.DATABASE_URL;',
  ])("%s", (text) => {
    expect(readsEnvironment(text)).toBe(true);
  });

  it("and not what merely looks like it", () => {
    expect(readsEnvironment('const environment = config.env; const name = "process.env";')).toBe(false);
  });
});
