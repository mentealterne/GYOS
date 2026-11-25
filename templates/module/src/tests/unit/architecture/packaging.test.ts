// The package's shape: entry points, the build it ships, the migrations folder.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_MIGRATIONS_FOLDER } from "../../../migrations.ts";
import { MODULE_ROOT, moduleName, packageJson, SRC_ROOT } from "./module-files.ts";

const REQUIRED_FILES = [
  "index.ts",
  "contracts.ts",
  "repositories.ts",
  "migrations.ts",
  "logger.ts",
  "db/schema.ts",
  "db/migrate.ts",
  `config/${moduleName}-config.ts`,
  "module-controllers",
];

describe("the module's tree", () => {
  it.each(REQUIRED_FILES)("has src/%s", (path) => {
    expect(existsSync(join(SRC_ROOT, path))).toBe(true);
  });
});

describe("package.json", () => {
  it("is an ESM package with no side effects that ships dist, src and the migrations", () => {
    expect(packageJson.type).toBe("module");
    expect(packageJson.sideEffects).toBe(false);
    expect(packageJson.files).toEqual(expect.arrayContaining(["dist", "src", "drizzle"]));
  });

  it("exports the root entry and the contract", () => {
    expect(packageJson.exports["."]?.["@gyos/source"]).toBe("./src/index.ts");
    expect(packageJson.exports["./contracts"]?.["@gyos/source"]).toBe("./src/contracts.ts");
  });

  it.each(Object.entries(packageJson.exports))(
    "export %s: @gyos/source first, then the build's types and JavaScript",
    (_subpath, entry) => {
      expect(Object.keys(entry)).toEqual(["@gyos/source", "types", "default"]);
      const source = entry["@gyos/source"] ?? "";
      expect(source).toMatch(/^\.\/src\/.+\.ts$/);
      expect(existsSync(join(MODULE_ROOT, source))).toBe(true);
      const built = source.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, "");
      expect(entry.types).toBe(`${built}.d.ts`);
      expect(entry.default).toBe(`${built}.js`);
    },
  );
});

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}

describe("the migrations folder", () => {
  it("resolves to ./drizzle at the package root", () => {
    expect(SAMPLE_MIGRATIONS_FOLDER).toBe(join(MODULE_ROOT, "drizzle"));
    expect(existsSync(join(SAMPLE_MIGRATIONS_FOLDER, "meta", "_journal.json"))).toBe(true);
  });

  it("holds a SQL file for every journal entry, in timestamp order", () => {
    const journal = JSON.parse(
      readFileSync(join(SAMPLE_MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
    ) as Journal;
    expect(journal.entries.length).toBeGreaterThan(0);
    journal.entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      expect(existsSync(join(SAMPLE_MIGRATIONS_FOLDER, `${entry.tag}.sql`))).toBe(true);
      // Drizzle 0.x skips a migration older than the last one applied, without a word.
      if (index > 0) expect(entry.when).toBeGreaterThan(journal.entries[index - 1]?.when ?? 0);
    });
  });
});
