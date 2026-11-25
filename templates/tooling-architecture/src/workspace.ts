// Reads the workspace's packages from disk. The checks in rules.ts are pure functions of this.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export interface TextFile {
  /** Relative to the package directory, with forward slashes. */
  path: string;
  text: string;
}

export interface WorkspacePackage {
  /** The package name: "@module/billing", "api". */
  name: string;
  /** Relative to the workspace root: "modules/billing". */
  dir: string;
  /** Every package it declares: dependencies, devDependencies, peerDependencies. */
  declared: string[];
  /** Its exports subpaths: ".", "./contracts", "./items". */
  exports: string[];
  /** Its TypeScript sources, outside node_modules and dist. */
  sources: TextFile[];
  /** Its generated SQL migrations (drizzle/*.sql). */
  migrations: TextFile[];
}

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: Record<string, unknown>;
}

const SKIP = new Set(["node_modules", "dist", "reports", ".turbo", "coverage"]);

function listFiles(dir: string, keep: (path: string) => boolean, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(join(dir, entry.name), keep, path);
    return keep(path) ? [path] : [];
  });
}

function readPackage(root: string, dir: string): WorkspacePackage {
  const absolute = join(root, dir);
  const json = JSON.parse(readFileSync(join(absolute, "package.json"), "utf8")) as PackageJson;
  const read = (path: string): TextFile => ({ path, text: readFileSync(join(absolute, path), "utf8") });
  return {
    name: json.name,
    dir: dir.split(sep).join("/"),
    declared: Object.keys({ ...json.dependencies, ...json.devDependencies, ...json.peerDependencies }),
    exports: Object.keys(json.exports ?? {}),
    sources: listFiles(absolute, (path) => /\.(c|m)?tsx?$/.test(path) && !path.endsWith(".d.ts")).map(read),
    migrations: listFiles(join(absolute, "drizzle"), (path) => path.endsWith(".sql")).map((path) =>
      read(`drizzle/${path}`),
    ),
  };
}

/** Every package under modules/ and apps/ that has a package.json. */
export function readWorkspace(root: string = WORKSPACE_ROOT): WorkspacePackage[] {
  return ["modules", "apps"].flatMap((group) => {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) return [];
    return readdirSync(groupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(groupDir, entry.name, "package.json")))
      .map((entry) => readPackage(root, `${group}/${entry.name}`));
  });
}

/** A module's src/db/migrate.ts, if it has one. */
export function readMigrator(root: string, pkg: WorkspacePackage): string | undefined {
  const path = join(root, pkg.dir, "src", "db", "migrate.ts");
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}
