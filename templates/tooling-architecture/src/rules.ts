// Rules between modules (standards/module.md, M7, M8 and M10). Pure functions of the workspace,
// so each one can be run on a synthetic workspace that breaks it.
//
// Imports are read with ts.preProcessFile from the TypeScript 6 API: TypeScript 7.0 ships no
// programmatic API, so "typescript" is aliased to @typescript/typescript6 (see pnpm-workspace.yaml).
import { posix } from "node:path";
import ts from "typescript";
import type { WorkspacePackage } from "./workspace.ts";

export interface Violation {
  rule: string;
  where: string;
  message: string;
}

const MODULE_SCOPE = "@module/";

export function importsOf(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((imported) => imported.fileName);
}

/** "@module/billing/contracts" → { name: "@module/billing", subpath: "./contracts" }. */
export function parseModuleSpecifier(specifier: string): { name: string; subpath: string } | null {
  if (!specifier.startsWith(MODULE_SCOPE)) return null;
  const [scope, name, ...rest] = specifier.split("/");
  return { name: `${scope}/${name}`, subpath: rest.length === 0 ? "." : `./${rest.join("/")}` };
}

/**
 * M10: a package imports a module only if it declares it in package.json, only through an entry
 * point the module exports, and never by reaching into another package's directory.
 */
export function checkModuleImports(packages: readonly WorkspacePackage[]): Violation[] {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const violations: Violation[] = [];
  for (const pkg of packages) {
    for (const file of pkg.sources) {
      const where = `${pkg.dir}/${file.path}`;
      for (const specifier of importsOf(file.text)) {
        if (specifier.startsWith(".")) {
          const target = posix.normalize(posix.join(posix.dirname(file.path), specifier));
          if (target.startsWith("../")) {
            violations.push({
              rule: "relative-escape",
              where,
              message: `"${specifier}" reaches outside ${pkg.dir}; import the package by name`,
            });
          }
          continue;
        }
        const parsed = parseModuleSpecifier(specifier);
        if (parsed === null || parsed.name === pkg.name) continue;
        const target = byName.get(parsed.name);
        if (target === undefined) {
          violations.push({ rule: "unknown-module", where, message: `"${specifier}" is not in the workspace` });
          continue;
        }
        if (!pkg.declared.includes(parsed.name)) {
          violations.push({
            rule: "undeclared",
            where,
            message: `imports ${parsed.name} without declaring it in ${pkg.dir}/package.json`,
          });
        }
        if (!target.exports.includes(parsed.subpath)) {
          violations.push({
            rule: "entry-point",
            where,
            message: `"${specifier}" is not an entry point of ${parsed.name} (exports: ${target.exports.join(", ")})`,
          });
        }
      }
    }
  }
  return violations;
}

/** The module dependency graph: declared @module/* dependencies and actual imports. */
export function moduleGraph(packages: readonly WorkspacePackage[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const pkg of packages) {
    if (!pkg.name.startsWith(MODULE_SCOPE)) continue;
    const edges = new Set(pkg.declared.filter((name) => name.startsWith(MODULE_SCOPE)));
    for (const file of pkg.sources) {
      for (const specifier of importsOf(file.text)) {
        const parsed = parseModuleSpecifier(specifier);
        if (parsed !== null) edges.add(parsed.name);
      }
    }
    edges.delete(pkg.name);
    graph.set(pkg.name, edges);
  }
  return graph;
}

/** M10: modules depend on each other one way. Reports each cycle once. */
export function checkNoCycles(packages: readonly WorkspacePackage[]): Violation[] {
  const graph = moduleGraph(packages);
  const violations: Violation[] = [];
  const done = new Set<string>();
  const seen = new Set<string>();
  const visit = (name: string, path: string[]): void => {
    if (done.has(name)) return;
    const start = path.indexOf(name);
    if (start !== -1) {
      const cycle = [...path.slice(start), name];
      const key = [...cycle.slice(0, -1)].sort().join(" ");
      if (!seen.has(key)) {
        seen.add(key);
        violations.push({ rule: "cycle", where: name, message: cycle.join(" → ") });
      }
      return;
    }
    for (const next of graph.get(name) ?? []) visit(next, [...path, name]);
  };
  for (const name of graph.keys()) {
    visit(name, []);
    done.add(name);
  }
  return violations;
}

const LOCK_KEY = /export const MIGRATION_LOCK_KEY = ([0-9a-fA-Fx_]+n);/;
const MIGRATIONS_TABLE = /export const MIGRATIONS_TABLE = "([^"]+)";/;

export interface Migrator {
  module: string;
  text: string;
}

/**
 * M8: migrations of all modules run one at a time, so every module takes the same advisory lock;
 * and each module keeps its bookkeeping in its own table, __migrations_<name>.
 */
export function checkMigrators(migrators: readonly Migrator[]): Violation[] {
  const violations: Violation[] = [];
  const keys = new Map<string, string[]>();
  for (const { module, text } of migrators) {
    const key = LOCK_KEY.exec(text)?.[1];
    if (key === undefined) {
      violations.push({ rule: "lock-key", where: module, message: "declares no MIGRATION_LOCK_KEY" });
    } else {
      keys.set(key, [...(keys.get(key) ?? []), module]);
    }
    const table = MIGRATIONS_TABLE.exec(text)?.[1];
    const expected = `__migrations_${module.replace(MODULE_SCOPE, "")}`;
    if (table !== expected) {
      violations.push({
        rule: "bookkeeping-table",
        where: module,
        message: `keeps its bookkeeping in ${table ?? "nothing"}, expected ${expected}`,
      });
    }
  }
  if (keys.size > 1) {
    const summary = [...keys].map(([key, modules]) => `${key}: ${modules.join(", ")}`).join("; ");
    violations.push({ rule: "lock-key", where: "workspace", message: `different lock keys (${summary})` });
  }
  return violations;
}

/** M7: no foreign key leaves the module's schema. Reads the generated SQL. */
export function checkNoForeignKeysAcrossSchemas(packages: readonly WorkspacePackage[]): Violation[] {
  const violations: Violation[] = [];
  for (const pkg of packages) {
    if (!pkg.name.startsWith(MODULE_SCOPE)) continue;
    const schema = pkg.name.slice(MODULE_SCOPE.length);
    for (const file of pkg.migrations) {
      for (const match of file.text.matchAll(/REFERENCES\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi)) {
        const reference = match[1] ?? "";
        const parts = reference.split(".").map((part) => part.replace(/^"|"$/g, ""));
        const target = parts.length === 2 ? parts[0] : "public";
        if (target !== schema) {
          violations.push({
            rule: "foreign-key",
            where: `${pkg.dir}/${file.path}`,
            message: `a foreign key references ${reference}, outside the "${schema}" schema`,
          });
        }
      }
    }
  }
  return violations;
}
