// The layer rules of standards/module.md, as code. Each rule reads like a row of the standard's
// table; layers.test.ts runs them on the real source and on synthetic violations.
//
// Imports are read with ts.preProcessFile from the TypeScript 6 API: TypeScript 7.0 ships no
// programmatic API, so "typescript" is aliased to @typescript/typescript6 (see pnpm-workspace.yaml).
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

export type Target = Part | { kind: "package"; name: string } | { kind: "builtin"; name: string };

const AREA_PARTS = { domain: true, services: true, adapters: true } as const;

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
  return { kind: "package", name };
}

interface Rule {
  /** Internal parts this part may import. */
  internal: (from: Part, to: Part) => boolean;
  /** Packages this part may import. */
  packages: readonly string[];
  /** Whether it may import Node built-ins (I/O). */
  builtins: boolean;
}

const sameArea = (from: Part, to: Part): boolean =>
  "area" in from && "area" in to && from.area === to.area;
const isKind = (to: Part, ...kinds: Part["kind"][]): boolean => kinds.includes(to.kind);

/** The standard's layer table. "May import" is an allow-list: anything else is a violation. */
export const RULES: Record<Exclude<Part["kind"], "tests" | "outside" | "unknown">, Rule> = {
  // The factory and the config contract: everything it wires.
  index: { internal: () => true, packages: ["*"], builtins: true },
  // Types only (checked separately: the file must compile to nothing).
  contracts: { internal: () => true, packages: [], builtins: false },
  // Builds every adapter on its connection.
  repositories: {
    internal: (_f, to) => isKind(to, "adapters", "ports", "db"),
    packages: ["drizzle-orm", "pg"],
    builtins: false,
  },
  migrations: { internal: () => false, packages: [], builtins: true },
  logger: { internal: () => false, packages: [], builtins: false },
  // The published language: zod, and nothing with I/O.
  vocabulary: { internal: (_f, to) => isKind(to, "vocabulary"), packages: ["zod"], builtins: false },
  // Parse input, delegate: services, vocabulary, zod. Never adapters, db/ or transport types.
  controllers: {
    internal: (_f, to) => isKind(to, "controllers", "services", "vocabulary"),
    packages: ["zod"],
    builtins: false,
  },
  // Pure rules: the vocabulary and its own domain/.
  domain: {
    internal: (from, to) => isKind(to, "vocabulary") || (isKind(to, "domain") && sameArea(from, to)),
    packages: [],
    builtins: false,
  },
  // Use cases: its domain/, any ports.ts, the logger port. Never adapters, db/, Drizzle, pg.
  services: {
    internal: (from, to) =>
      isKind(to, "ports", "logger") || (isKind(to, "domain", "services") && sameArea(from, to)),
    packages: [],
    builtins: false,
  },
  // Interfaces only.
  ports: {
    internal: (from, to) => isKind(to, "ports", "vocabulary") || (isKind(to, "domain") && sameArea(from, to)),
    packages: [],
    builtins: false,
  },
  // Its ports.ts, db/, Drizzle. Never services/ or another area's adapters.
  adapters: {
    internal: (from, to) => isKind(to, "db") || (isKind(to, "ports", "adapters") && sameArea(from, to)),
    packages: ["drizzle-orm", "pg"],
    builtins: true,
  },
  // The schema and the migration runner.
  db: { internal: (_f, to) => isKind(to, "db"), packages: ["drizzle-orm", "pg"], builtins: true },
  // The configuration contract: types of the ports the host provides, the logger, the defaults.
  config: {
    internal: (_f, to) => isKind(to, "config", "logger", "migrations", "ports"),
    packages: ["pg"],
    builtins: true,
  },
};

export function importsOf(file: SourceFile): string[] {
  return ts.preProcessFile(file.text, true, true).importedFiles.map((imported) => imported.fileName);
}

const describePart = (part: Target): string =>
  "area" in part ? `${part.area}/${part.kind}` : "name" in part ? `${part.kind} ${part.name}` : part.kind;

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
    for (const specifier of importsOf(file)) {
      const to = resolveTarget(file.path, specifier, vocabulary);
      const allowed =
        to.kind === "package"
          ? rule.packages.includes("*") || rule.packages.includes(to.name)
          : to.kind === "builtin"
            ? rule.builtins
            : to.kind !== "outside" && to.kind !== "unknown" && to.kind !== "tests" && rule.internal(from, to);
      if (!allowed) {
        violations.push({
          rule: from.kind,
          file: file.path,
          message: `${describePart(from)} may not import ${describePart(to)} ("${specifier}")`,
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
    .filter((file) => readsEnvironment(ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest)))
    .map((file) => ({ rule: "no-env", file: file.path, message: "reads process.env" }));
}

function readsEnvironment(node: ts.Node): boolean {
  const isProcess = (expression: ts.Expression): boolean =>
    ts.isIdentifier(expression) && expression.text === "process";
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
  return ts.forEachChild(node, readsEnvironment) ?? false;
}
