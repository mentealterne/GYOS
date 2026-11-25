// Reads this module from disk for the architecture tests.
import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceFile } from "./rules.ts";

export const MODULE_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const SRC_ROOT = join(MODULE_ROOT, "src");

export interface ExportEntry {
  "@gyos/source"?: string;
  types?: string;
  default?: string;
}

export interface PackageJson {
  name: string;
  type?: string;
  sideEffects?: boolean;
  files?: string[];
  exports: Record<string, ExportEntry>;
}

export const packageJson = JSON.parse(
  readFileSync(join(MODULE_ROOT, "package.json"), "utf8"),
) as PackageJson;

/** The module's name, from "@module/<name>". */
export const moduleName = packageJson.name.replace(/^@module\//, "");

/** The vocabulary files: every export other than the root and the contract, relative to src/. */
export const vocabularyFiles: string[] = Object.entries(packageJson.exports)
  .filter(([subpath]) => subpath !== "." && subpath !== "./contracts")
  .map(([, entry]) => (entry["@gyos/source"] ?? "").replace(/^\.\/src\//, ""));

/** Every .ts file under src/, tests included (the rules skip them). */
export function readSources(): SourceFile[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => ({
      path: path.split(sep).join("/"),
      text: readFileSync(join(SRC_ROOT, path), "utf8"),
    }));
}
