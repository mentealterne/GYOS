// The layer rules of standards/module.md, as code. Each rule reads like a row of the standard's
// table; layers.test.ts runs them on the real source and on synthetic violations.
//
// Imports are read with the TypeScript 6 API: TypeScript 7.0 ships no programmatic API, so
// "typescript" is aliased to @typescript/typescript6 (see pnpm-workspace.yaml).
import { builtinModules } from "node:module";
import { posix } from "node:path";
import ts from "typescript";

/** A source file, its path relative to src/ with forward slashes. */
export interface SourceFile {
  path: string;
  text: string;
}

export interface Violation {
  rule: string;
  file: string;
  message: string;
}

export type Part =
  | { kind: "index" | "contracts" | "repositories" | "migrations" | "logger" | "vocabulary" }
  | { kind: "controllers" | "db" | "config" | "tests" }
  | { kind: "domain" | "services" | "ports" | "adapters"; area: string }
  | { kind: "outside"; path: string }
  | { kind: "unknown"; path: string };

/**
 * Another workspace module (`@module/<name>`), by the entry point imported: the root entry, the
 * contract, a vocabulary subpath (one kebab-case segment), or anything deeper, which no entry
 * point allows. tooling/architecture checks that the entry point is really exported.
 */
export type ModuleEntry = "root" | "contracts" | "vocabulary" | "deep";

export type Target =
  | Part
  | { kind: "package"; name: string }
  | { kind: "builtin"; name: string }
  | { kind: "module"; name: string; entry: ModuleEntry };

/** An import, and whether it is erased at compile time (`import type`, `export type … from`). */
export interface Import {
  specifier: string;
  typeOnly: boolean;
}

const AREA_PARTS = { domain: true, services: true, adapters: true } as const;
const MODULE_SCOPE = "@module/";

/** Where a src-relative path belongs. `vocabulary` lists the vocabulary files (src-relative). */
export function classify(path: string, vocabulary: readonly string[]): Part {
  if (path.startsWith("../")) return { kind: "outside", path };
  const segments = path.split("/");
  const [first, second] = segments;
  if (segments.length === 1) {
    if (vocabulary.includes(path)) return { kind: "vocabulary" };
    const kinds = {
      "index.ts": "index",
      "contracts.ts": "contracts",
      "repositories.ts": "repositories",
      "migrations.ts": "migrations",
      "logger.ts": "logger",
    } as const;
    const kind = kinds[path as keyof typeof kinds];
    return kind === undefined ? { kind: "unknown", path } : { kind };
  }
  if (first === "module-controllers") return { kind: "controllers" };
  if (first === "db") return { kind: "db" };
  if (first === "config") return { kind: "config" };
  if (first === "tests") return { kind: "tests" };
  if (first !== undefined && second !== undefined) {
    if (segments.length === 2 && second === "ports.ts") return { kind: "ports", area: first };
    if (segments.length > 2 && second in AREA_PARTS) {
      return { kind: second as keyof typeof AREA_PARTS, area: first };
    }
  }
  return { kind: "unknown", path };
}

/** What a specifier in `fromPath` points at. */
export function resolveTarget(fromPath: string, specifier: string, vocabulary: readonly string[]): Target {
  if (specifier.startsWith(".")) {
    return classify(posix.normalize(posix.join(posix.dirname(fromPath), specifier)), vocabulary);
  }
  if (specifier.startsWith("node:") || builtinModules.includes(specifier)) {
    return { kind: "builtin", name: specifier };
  }
  const segments = specifier.split("/");
  const name = specifier.startsWith("@") ? segments.slice(0, 2).join("/") : (segments[0] ?? specifier);
  if (name.startsWith(MODULE_SCOPE)) {
    const rest = segments.slice(2);
    const entry: ModuleEntry =
      rest.length === 0
        ? "root"
        : rest.length === 1 && rest[0] === "contracts"
          ? "contracts"
          : rest.length === 1 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(rest[0] ?? "")
            ? "vocabulary"
            : "deep";
    return { kind: "module", name, entry };
  }
  return { kind: "package", name };
}

/**
 * What a part may import from another module (M10). `types` lists the entry points it may import
 * types from, `values` those it may import runtime code from. Value imports of another module's
 * vocabulary are how a module that conforms to another's language uses its constants and schemas.
 */
interface ModuleImports {
  types: readonly ModuleEntry[];
  values: readonly ModuleEntry[];
}

interface Rule {
  /** Internal parts this part may import. */
  internal: (from: Part, to: Part) => boolean;
  /** npm packages this part may import, or "*" for any. */
  packages: readonly string[];
  /** Whether it may import Node built-ins (I/O). */
  builtins: boolean;
  /** Entry points of other workspace modules it may import. */
  modules: ModuleImports;
}

const sameArea = (from: Part, to: Part): boolean =>
  "area" in from && "area" in to && from.area === to.area;
const isKind = (to: Part, ...kinds: Part["kind"][]): boolean => kinds.includes(to.kind);

const ENTRY_POINTS: readonly ModuleEntry[] = ["root", "contracts", "vocabulary"];
const NO_MODULES: ModuleImports = { types: [], values: [] };
/** Types from any entry point, and nothing at runtime. */
const TYPES_ONLY: ModuleImports = { types: ENTRY_POINTS, values: [] };
/** Types from any entry point; runtime code from vocabularies only. */
const TYPES_AND_VOCABULARY: ModuleImports = { types: ENTRY_POINTS, values: ["vocabulary"] };
const VOCABULARY_ONLY: ModuleImports = { types: ["vocabulary"], values: ["vocabulary"] };

/** The standard's layer table. "May import" is an allow-list: anything else is a violation. */
export const RULES: Record<Exclude<Part["kind"], "tests" | "outside" | "unknown">, Rule> = {
  // The factory and the config contract: everything it wires.
  index: {
    internal: () => true,
    packages: ["*"],
    builtins: true,
    modules: { types: ENTRY_POINTS, values: ENTRY_POINTS },
  },
  // Types only (checked separately: the file must compile to nothing).
  contracts: { internal: () => true, packages: [], builtins: false, modules: { types: ENTRY_POINTS, values: [] } },
  // Builds every adapter on its connection.
  repositories: {
    internal: (_f, to) => isKind(to, "adapters", "ports", "db"),
    packages: ["drizzle-orm", "pg"],
    builtins: false,
    modules: NO_MODULES,
  },
  migrations: { internal: () => false, packages: [], builtins: true, modules: NO_MODULES },
  logger: { internal: () => false, packages: [], builtins: false, modules: NO_MODULES },
  // The published language: zod, its own vocabulary files, and nothing with I/O.
  vocabulary: {
    internal: (_f, to) => isKind(to, "vocabulary"),
    packages: ["zod"],
    builtins: false,
    modules: VOCABULARY_ONLY,
  },
  // Parse input, delegate: services, vocabulary, zod. Never adapters, db/ or transport types.
  controllers: {
    internal: (_f, to) => isKind(to, "controllers", "services", "vocabulary"),
    packages: ["zod"],
    builtins: false,
    modules: VOCABULARY_ONLY,
  },
  // Pure rules: the vocabulary and its own domain/.
  domain: {
    internal: (from, to) => isKind(to, "vocabulary") || (isKind(to, "domain") && sameArea(from, to)),
    packages: [],
    builtins: false,
    modules: VOCABULARY_ONLY,
  },
  // Use cases: its domain/ and services/, any ports.ts, the vocabulary, the logger port. Never
  // adapters, db/, Drizzle, pg.
  services: {
    internal: (from, to) =>
      isKind(to, "ports", "vocabulary", "logger") || (isKind(to, "domain", "services") && sameArea(from, to)),
    packages: [],
    builtins: false,
    modules: TYPES_AND_VOCABULARY,
  },
  // Interfaces only.
  ports: {
    internal: (from, to) => isKind(to, "ports", "vocabulary") || (isKind(to, "domain") && sameArea(from, to)),
    packages: [],
    builtins: false,
    modules: TYPES_ONLY,
  },
  // Its own ports.ts, domain/ and adapters/, the vocabulary, db/, the logger port, any package,
  // Node built-ins. Never services/, nor another area's adapters, ports or domain.
  adapters: {
    internal: (from, to) =>
      isKind(to, "db", "vocabulary", "logger") || (isKind(to, "ports", "domain", "adapters") && sameArea(from, to)),
    packages: ["*"],
    builtins: true,
    modules: { types: ENTRY_POINTS, values: ENTRY_POINTS },
  },
  // The schema and the migration runner; the vocabulary, for enums built from published unions.
  db: {
    internal: (_f, to) => isKind(to, "db", "vocabulary"),
    packages: ["drizzle-orm", "pg"],
    builtins: true,
    modules: VOCABULARY_ONLY,
  },
  // The configuration contract: types of the ports the host provides, the logger, the defaults.
  config: {
    internal: (_f, to) => isKind(to, "config", "logger", "migrations", "ports"),
    packages: ["pg"],
    builtins: true,
    modules: TYPES_ONLY,
  },
};

/** Every import of a file: static, re-exports, dynamic import(), require(), and import types. */
export function importsOf(file: SourceFile): Import[] {
  const imports: Import[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ specifier: node.moduleSpecifier.text, typeOnly: node.importClause?.isTypeOnly ?? false });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({ specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
      }
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        imports.push({ specifier: argument.literal.text, typeOnly: true });
      }
    } else if (ts.isCallExpression(node)) {
      const [first] = node.arguments;
      const callee = node.expression;
      const loads =
        callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require");
      if (loads && first !== undefined && ts.isStringLiteralLike(first)) {
        imports.push({ specifier: first.text, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true));
  return imports;
}

const describePart = (part: Target): string =>
  part.kind === "module"
    ? `${part.name} (${part.entry === "root" ? "root entry" : part.entry})`
    : "area" in part
      ? `${part.area}/${part.kind}`
      : "name" in part
        ? `${part.kind} ${part.name}`
        : part.kind;

/** Every import that breaks the layer table. Files under src/tests are not checked. */
export function checkLayers(files: readonly SourceFile[], vocabulary: readonly string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const from = classify(file.path, vocabulary);
    if (from.kind === "tests") continue;
    if (from.kind === "unknown" || from.kind === "outside") {
      violations.push({ rule: "layout", file: file.path, message: "not a part of the module's tree" });
      continue;
    }
    const rule = RULES[from.kind];
    for (const { specifier, typeOnly } of importsOf(file)) {
      const to = resolveTarget(file.path, specifier, vocabulary);
      const allowed =
        to.kind === "module"
          ? (typeOnly ? rule.modules.types : rule.modules.values).includes(to.entry)
          : to.kind === "package"
            ? rule.packages.includes("*") || rule.packages.includes(to.name)
            : to.kind === "builtin"
              ? rule.builtins
              : to.kind !== "outside" && to.kind !== "unknown" && to.kind !== "tests" && rule.internal(from, to);
      if (!allowed) {
        const what = to.kind === "module" && !typeOnly ? "runtime code from " : "";
        violations.push({
          rule: from.kind,
          file: file.path,
          message: `${describePart(from)} may not import ${what}${describePart(to)} ("${specifier}")`,
        });
      }
    }
  }
  return violations;
}

/** A file that must hold types only compiles to nothing but `export {};`. */
export function emitsRuntimeCode(file: SourceFile): boolean {
  const output = ts.transpileModule(file.text, {
    fileName: file.path,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      verbatimModuleSyntax: true,
      removeComments: true,
    },
  }).outputText;
  return output.replace(/\s+/g, " ").trim() !== "export {};";
}

/** contracts.ts and every ports.ts hold types only. */
export function checkTypesOnly(files: readonly SourceFile[], vocabulary: readonly string[]): Violation[] {
  return files
    .filter((file) => {
      const part = classify(file.path, vocabulary);
      return part.kind === "contracts" || part.kind === "ports";
    })
    .filter(emitsRuntimeCode)
    .map((file) => ({ rule: "types-only", file: file.path, message: "must hold types only" }));
}

/** M6: the host reads the environment; nothing under src/ does. */
export function checkNoEnvironment(files: readonly SourceFile[], vocabulary: readonly string[]): Violation[] {
  return files
    .filter((file) => classify(file.path, vocabulary).kind !== "tests")
    .filter((file) => readsEnvironment(ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true)))
    .map((file) => ({ rule: "no-env", file: file.path, message: "reads process.env" }));
}

const PROCESS_MODULES = new Set(["process", "node:process"]);
const isEnv = (name: ts.PropertyName | ts.ModuleExportName | undefined): boolean =>
  name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === "env";

/**
 * Whether a file reads the environment, however it is spelled: `process.env`, `process["env"]`,
 * `globalThis.process.env`, `const { env } = process`, `import { env } from "node:process"`, or
 * `.env` on a default or namespace import of `node:process`.
 */
function readsEnvironment(source: ts.SourceFile): boolean {
  // Local names bound to the process object: the global, and default or namespace imports of it.
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
    if (ts.isPropertyAccessExpression(node) && isProcess(node.expression) && node.name.text === "env") {
      return true;
    }
    if (
      ts.isElementAccessExpression(node) &&
      isProcess(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    ) {
      return true;
    }
    // const { env } = process, const { env: environment } = process
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
