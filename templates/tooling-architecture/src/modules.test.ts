// The rules between modules, on the real workspace and, next to each rule, on a synthetic
// workspace that breaks it: a check that cannot fail proves nothing.
import { describe, expect, it } from "vitest";
import {
  checkMigrators,
  checkModuleImports,
  checkNoCycles,
  checkNoForeignKeysAcrossSchemas,
  type Migrator,
  type Violation,
} from "./rules.ts";
import { readMigrator, readWorkspace, WORKSPACE_ROOT, type WorkspacePackage } from "./workspace.ts";

const workspace = readWorkspace();
const modules = workspace.filter((pkg) => pkg.name.startsWith("@module/"));
const migrators: Migrator[] = modules.flatMap((pkg) => {
  const text = readMigrator(WORKSPACE_ROOT, pkg);
  return text === undefined ? [] : [{ module: pkg.name, text }];
});

describe("the workspace", () => {
  it("has modules to check", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it("imports modules only through declared entry points", () => {
    expect(checkModuleImports(workspace)).toEqual([]);
  });

  it("has no cycle between modules", () => {
    expect(checkNoCycles(workspace)).toEqual([]);
  });

  it("migrates every module under one lock, each into its own bookkeeping table", () => {
    expect(migrators).toHaveLength(modules.length);
    expect(checkMigrators(migrators)).toEqual([]);
  });

  it("has no foreign key that leaves a module's schema", () => {
    expect(checkNoForeignKeysAcrossSchemas(workspace)).toEqual([]);
  });

  it.todo("publishes only the views in the closed set, and no view reads another module's view");
  it.todo("adds no migration older than the newest one on main (Drizzle 0.x skips it silently)");
});

function pkg(name: string, overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    name,
    dir: name.startsWith("@module/") ? `modules/${name.slice(8)}` : `apps/${name}`,
    declared: [],
    exports: [".", "./contracts"],
    sources: [],
    migrations: [],
    ...overrides,
  };
}

const source = (text: string, path = "src/index.ts") => [{ path, text }];

function expectViolation(violations: Violation[], rule: string): void {
  expect(violations).toContainEqual(expect.objectContaining({ rule }));
}

describe("each rule reports a synthetic violation", () => {
  it("an import of a module that is not declared", () => {
    const workspace = [
      pkg("@module/billing"),
      pkg("@module/scheduling", { sources: source(`import type { Invoice } from "@module/billing/contracts";`) }),
    ];
    expectViolation(checkModuleImports(workspace), "undeclared");
  });

  it("an import below a module's entry points", () => {
    const workspace = [
      pkg("@module/billing"),
      pkg("@module/scheduling", {
        declared: ["@module/billing"],
        sources: source(`import { x } from "@module/billing/src/invoices/domain/invoice.ts";`),
      }),
    ];
    expectViolation(checkModuleImports(workspace), "entry-point");
  });

  it("a relative import into another package", () => {
    const workspace = [
      pkg("api", { sources: source(`import { x } from "../../../modules/billing/src/index.ts";`) }),
    ];
    expectViolation(checkModuleImports(workspace), "relative-escape");
  });

  it("an import of a module that doesn't exist", () => {
    const workspace = [pkg("api", { sources: source(`import { x } from "@module/nowhere";`) })];
    expectViolation(checkModuleImports(workspace), "unknown-module");
  });

  it("a host that imports declared entry points is fine", () => {
    const workspace = [
      pkg("@module/billing"),
      pkg("api", {
        declared: ["@module/billing"],
        sources: source(`import { createBillingModule } from "@module/billing";\nimport type { X } from "@module/billing/contracts";`),
      }),
    ];
    expect(checkModuleImports(workspace)).toEqual([]);
  });

  it("a cycle through declared dependencies", () => {
    const workspace = [
      pkg("@module/billing", { declared: ["@module/scheduling"] }),
      pkg("@module/scheduling", { declared: ["@module/calendar"] }),
      pkg("@module/calendar", { declared: ["@module/billing"] }),
    ];
    const violations = checkNoCycles(workspace);
    expect(violations).toHaveLength(1);
    expectViolation(violations, "cycle");
  });

  it("a cycle through imports alone", () => {
    const workspace = [
      pkg("@module/billing", { sources: source(`import type { A } from "@module/scheduling/contracts";`) }),
      pkg("@module/scheduling", { sources: source(`import type { B } from "@module/billing/contracts";`) }),
    ];
    expectViolation(checkNoCycles(workspace), "cycle");
  });

  it("a one-way dependency is not a cycle", () => {
    const workspace = [
      pkg("@module/billing"),
      pkg("@module/scheduling", { declared: ["@module/billing"] }),
    ];
    expect(checkNoCycles(workspace)).toEqual([]);
  });

  const migrator = (key: string, table: string) =>
    `export const MIGRATION_LOCK_KEY = ${key};\nexport const MIGRATIONS_TABLE = "${table}";`;

  it("two modules that migrate under different locks", () => {
    expectViolation(
      checkMigrators([
        { module: "@module/billing", text: migrator("0x67796f736d6967n", "__migrations_billing") },
        { module: "@module/scheduling", text: migrator("42n", "__migrations_scheduling") },
      ]),
      "lock-key",
    );
  });

  it("a module whose bookkeeping table is not its own", () => {
    expectViolation(
      checkMigrators([
        { module: "@module/billing", text: migrator("0x67796f736d6967n", "__migrations_billing") },
        { module: "@module/scheduling", text: migrator("0x67796f736d6967n", "__migrations_billing") },
      ]),
      "bookkeeping-table",
    );
  });

  it("a foreign key into another module's schema", () => {
    const workspace = [
      pkg("@module/scheduling", {
        migrations: [
          {
            path: "drizzle/0001_link.sql",
            text: `ALTER TABLE "scheduling"."slots" ADD CONSTRAINT "slots_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "billing"."invoices"("id");`,
          },
        ],
      }),
    ];
    expectViolation(checkNoForeignKeysAcrossSchemas(workspace), "foreign-key");
  });

  it("a foreign key inside the module's own schema is fine", () => {
    const workspace = [
      pkg("@module/scheduling", {
        migrations: [
          {
            path: "drizzle/0001_link.sql",
            text: `ALTER TABLE "scheduling"."slots" ADD CONSTRAINT "slots_day_fk" FOREIGN KEY ("day_id") REFERENCES "scheduling"."days"("id");`,
          },
        ],
      }),
    ];
    expect(checkNoForeignKeysAcrossSchemas(workspace)).toEqual([]);
  });
});
