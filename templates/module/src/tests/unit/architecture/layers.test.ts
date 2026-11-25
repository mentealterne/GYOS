// The layer rules on the real source, and next to each rule a synthetic file that breaks it:
// a check that cannot fail proves nothing. Next to each allowance, a synthetic file that uses it:
// a rule that refuses what the standard prescribes is wrong too.
import { describe, expect, it } from "vitest";
import { readSources, vocabularyFiles } from "./module-files.ts";
import {
  checkLayers,
  checkNoEnvironment,
  checkTypesOnly,
  type SourceFile,
  type Violation,
} from "./rules.ts";

const sources = readSources();
const VOCABULARY = "items-vocabulary.ts";

describe("the module's source", () => {
  it("follows the layer table", () => {
    expect(checkLayers(sources, vocabularyFiles)).toEqual([]);
  });

  it("holds types only in contracts.ts and every ports.ts", () => {
    expect(checkTypesOnly(sources, vocabularyFiles)).toEqual([]);
  });

  it("never reads process.env", () => {
    expect(checkNoEnvironment(sources, vocabularyFiles)).toEqual([]);
  });

  it("has its vocabulary file", () => {
    expect(vocabularyFiles).toContain(VOCABULARY);
  });
});

type Check = (files: readonly SourceFile[], vocabulary: readonly string[]) => Violation[];

interface Case {
  breaks: string;
  check?: Check;
  path: string;
  text: string;
  rule: string;
}

const violations: Case[] = [
  {
    breaks: "a controller doesn't query",
    path: "module-controllers/bad.controller.ts",
    text: `import { createPostgresItemRepository } from "../items/adapters/item-repository.postgres.ts";`,
    rule: "controllers",
  },
  {
    breaks: "a controller doesn't touch db/",
    path: "module-controllers/bad.controller.ts",
    text: `import { schema } from "../db/schema.ts";`,
    rule: "controllers",
  },
  {
    breaks: "no transport types in the module",
    path: "module-controllers/bad.controller.ts",
    text: `import type { Request } from "express";`,
    rule: "controllers",
  },
  {
    breaks: "a controller doesn't build another module",
    path: "module-controllers/bad.controller.ts",
    text: `import { createBillingModule } from "@module/billing";`,
    rule: "controllers",
  },
  {
    breaks: "the domain doesn't call use cases",
    path: "items/domain/bad.ts",
    text: `import { createItemService } from "../services/item-service.ts";`,
    rule: "domain",
  },
  {
    breaks: "validation libraries stay out of the domain",
    path: "items/domain/bad.ts",
    text: `import { z } from "zod";`,
    rule: "domain",
  },
  {
    breaks: "the domain does no I/O",
    path: "items/domain/bad.ts",
    text: `import { readFile } from "node:fs/promises";`,
    rule: "domain",
  },
  {
    breaks: "areas don't share domain code directly",
    path: "items/domain/bad.ts",
    text: `import type { OtherThing } from "../../other-area/domain/other-thing.ts";`,
    rule: "domain",
  },
  {
    breaks: "the domain uses another module's language only through its vocabulary",
    path: "items/domain/bad.ts",
    text: `import type { Invoice } from "@module/billing/contracts";`,
    rule: "domain",
  },
  {
    breaks: "a service doesn't import an adapter",
    path: "items/services/bad.ts",
    text: `import { createPostgresItemRepository } from "../adapters/item-repository.postgres.ts";`,
    rule: "services",
  },
  {
    breaks: "a service doesn't import db/",
    path: "items/services/bad.ts",
    text: `import { schema } from "../../db/schema.ts";`,
    rule: "services",
  },
  {
    breaks: "a service doesn't import Drizzle",
    path: "items/services/bad.ts",
    text: `import { eq } from "drizzle-orm";`,
    rule: "services",
  },
  {
    breaks: "a service doesn't import pg",
    path: "items/services/bad.ts",
    text: `import type { Pool } from "pg";`,
    rule: "services",
  },
  {
    breaks: "a service doesn't import another area's use cases",
    path: "items/services/bad.ts",
    text: `import { createOtherThingService } from "../../other-area/services/other-thing-service.ts";`,
    rule: "services",
  },
  {
    breaks: "a service receives another module through its config, never builds it",
    path: "items/services/bad.ts",
    text: `import { createBillingModule } from "@module/billing";`,
    rule: "services",
  },
  {
    breaks: "a service imports another module's contract as types only",
    path: "items/services/bad.ts",
    text: `import { BillingItemError } from "@module/billing/contracts";`,
    rule: "services",
  },
  {
    breaks: "an inline `type` modifier is not a type-only import (verbatimModuleSyntax keeps it)",
    path: "items/services/bad.ts",
    text: `import { type Invoice } from "@module/billing/contracts";`,
    rule: "services",
  },
  {
    breaks: "src doesn't reach outside src",
    path: "items/services/bad.ts",
    text: `import { createInMemoryItemRepository } from "../../../features/support/in-memory-item-repository.ts";`,
    rule: "services",
  },
  {
    breaks: "an adapter doesn't call use cases",
    path: "items/adapters/bad.postgres.ts",
    text: `import { createItemService } from "../services/item-service.ts";`,
    rule: "adapters",
  },
  {
    breaks: "areas never use each other's adapters",
    path: "other-area/adapters/other-thing-store.postgres.ts",
    text: `import { createPostgresItemRepository } from "../../items/adapters/item-repository.postgres.ts";`,
    rule: "adapters",
  },
  {
    breaks: "an adapter implements its own area's ports, not another's",
    path: "other-area/adapters/other-thing-store.postgres.ts",
    text: `import type { ItemRepository } from "../../items/ports.ts";`,
    rule: "adapters",
  },
  {
    breaks: "an adapter maps to its own area's domain, not another's",
    path: "other-area/adapters/other-thing-store.postgres.ts",
    text: `import type { Item } from "../../items/domain/item.ts";`,
    rule: "adapters",
  },
  {
    breaks: "ports hold no implementation",
    path: "items/ports.ts",
    text: `import type { X } from "./adapters/item-repository.postgres.ts";`,
    rule: "ports",
  },
  {
    breaks: "ports import another module's runtime code only from its vocabulary",
    path: "items/ports.ts",
    text: `import { createBillingModule } from "@module/billing";`,
    rule: "ports",
  },
  {
    breaks: "the vocabulary does no I/O",
    path: VOCABULARY,
    text: `import pg from "pg";`,
    rule: "vocabulary",
  },
  {
    breaks: "the vocabulary builds on other vocabularies only",
    path: VOCABULARY,
    text: `import type { Invoice } from "@module/billing/contracts";`,
    rule: "vocabulary",
  },
  {
    breaks: "db/ doesn't import the domain",
    path: "db/bad.ts",
    text: `import { ensureNameIsFree } from "../items/domain/item-name.ts";`,
    rule: "db",
  },
  {
    breaks: "db/ doesn't import a use case",
    path: "db/bad.ts",
    text: `import { createItemService } from "../items/services/item-service.ts";`,
    rule: "db",
  },
  {
    breaks: "config doesn't import an adapter",
    path: "config/bad.ts",
    text: `import { createPostgresItemRepository } from "../items/adapters/item-repository.postgres.ts";`,
    rule: "config",
  },
  {
    breaks: "config receives another module, never builds it",
    path: "config/bad.ts",
    text: `import { createBillingModule } from "@module/billing";`,
    rule: "config",
  },
  {
    breaks: "config takes another module's types, not its runtime code",
    path: "config/bad.ts",
    text: `import { ROLES } from "@module/identity/roles";`,
    rule: "config",
  },
  {
    breaks: "repositories.ts doesn't import another module",
    path: "repositories.ts",
    text: `import type { BillingModule } from "@module/billing";`,
    rule: "repositories",
  },
  {
    breaks: "repositories.ts doesn't import a use case",
    path: "repositories.ts",
    text: `import { createItemService } from "./items/services/item-service.ts";`,
    rule: "repositories",
  },
  {
    breaks: "nothing imports below another module's entry points, not even index.ts",
    path: "index.ts",
    text: `import { x } from "@module/billing/src/invoices/domain/invoice.ts";`,
    rule: "index",
  },
  {
    breaks: "an area holds only domain/, services/, ports.ts and adapters/",
    path: "items/helpers.ts",
    text: `export const x = 1;`,
    rule: "layout",
  },
  {
    breaks: "contracts.ts holds types only",
    check: checkTypesOnly,
    path: "contracts.ts",
    text: `export { SampleItemError } from "./items/domain/errors.ts";`,
    rule: "types-only",
  },
  {
    breaks: "ports.ts holds types only",
    check: checkTypesOnly,
    path: "items/ports.ts",
    text: `export const DEFAULT_PAGE_SIZE = 50;`,
    rule: "types-only",
  },
  ...[
    `export const url = process.env.DATABASE_URL;`,
    `export const url = process["env"].DATABASE_URL;`,
    `export const url = globalThis.process.env.DATABASE_URL;`,
    `const { env } = process;\nexport const url = env.DATABASE_URL;`,
    `const { env: environment } = process;\nexport const url = environment.DATABASE_URL;`,
    `import { env } from "node:process";\nexport const url = env.DATABASE_URL;`,
    `import { env as environment } from "process";\nexport const url = environment.DATABASE_URL;`,
    `import proc from "node:process";\nexport const url = proc.env.DATABASE_URL;`,
    `import * as proc from "node:process";\nexport const url = proc.env.DATABASE_URL;`,
  ].map((text) => ({
    breaks: `nothing in the module reads the environment: ${text.split("\n")[0]}`,
    check: checkNoEnvironment,
    path: "config/bad.ts",
    text,
    rule: "no-env",
  })),
];

describe("each rule reports a synthetic violation", () => {
  it.each(violations)("$breaks", ({ check = checkLayers, path, text, rule }) => {
    const found = check([{ path, text }], vocabularyFiles);
    expect(found).toContainEqual(expect.objectContaining({ rule, file: path }));
  });
});

interface Allowance {
  allows: string;
  check?: Check;
  path: string;
  text: string;
}

const allowances: Allowance[] = [
  {
    allows: "an adapter uses an outside SDK",
    path: "items/adapters/payment-gateway.stripe.ts",
    text: `import Stripe from "stripe";`,
  },
  {
    allows: "an adapter maps rows to its own area's domain types",
    path: "items/adapters/bad.postgres.ts",
    text: `import type { Item } from "../domain/item.ts";\nimport { itemNotFound } from "../domain/errors.ts";`,
  },
  {
    allows: "an adapter uses the vocabulary",
    path: "items/adapters/bad.postgres.ts",
    text: `import { ITEM_NAME_MAX_LENGTH } from "../../${VOCABULARY}";`,
  },
  {
    allows: "an adapter uses db/, Drizzle, pg, the logger port and Node built-ins",
    path: "items/adapters/bad.postgres.ts",
    text: [
      `import { schema } from "../../db/schema.ts";`,
      `import { eq } from "drizzle-orm";`,
      `import type { Pool } from "pg";`,
      `import type { SampleLogger } from "../../logger.ts";`,
      `import { randomUUID } from "node:crypto";`,
    ].join("\n"),
  },
  {
    allows: "an adapter implements a port by calling another module (M10, conformist)",
    path: "items/adapters/invoice-lookup.billing.ts",
    text: `import type { BillingModule } from "@module/billing";\nimport { INVOICE_STATES } from "@module/billing/invoices";`,
  },
  {
    allows: "db/ builds an enum from the vocabulary's published union",
    path: "db/schema.ts",
    text: `import { ITEM_ERROR_CODES } from "../${VOCABULARY}";`,
  },
  {
    allows: "db/ builds an enum from another module's vocabulary (M10, conformist)",
    path: "db/schema.ts",
    text: `import { ROLES } from "@module/identity/roles";`,
  },
  {
    allows: "config validates paths with Node built-ins and types the pool with pg",
    path: "config/extra.ts",
    text: `import { isAbsolute } from "node:path";\nimport type { Pool } from "pg";`,
  },
  {
    allows: "config receives another module's instance, typed from its root entry",
    path: "config/extra.ts",
    text: `import type { BillingModule } from "@module/billing";`,
  },
  {
    allows: "repositories.ts builds the adapters on Drizzle and pg",
    path: "repositories.ts",
    text: `import type { Pool } from "pg";\nimport { drizzle } from "drizzle-orm/node-postgres";`,
  },
  {
    allows: "a service uses the vocabulary",
    path: "items/services/item-limits.ts",
    text: `import { ITEM_NAME_MAX_LENGTH } from "../../${VOCABULARY}";`,
  },
  {
    allows: "a service uses its own area's other services",
    path: "items/services/item-archive.ts",
    text: `import { createItemService } from "./item-service.ts";`,
  },
  {
    allows: "a service uses another module's types and its vocabulary (M10, conformist)",
    path: "items/services/item-billing.ts",
    text: [
      `import type { BillingModule } from "@module/billing";`,
      `import type { Invoice } from "@module/billing/contracts";`,
      `import { INVOICE_STATES } from "@module/billing/invoices";`,
    ].join("\n"),
  },
  {
    allows: "a port speaks another module's language (M10, conformist)",
    path: "items/ports.ts",
    text: `import type { Invoice } from "@module/billing/contracts";\nimport type { InvoiceState } from "@module/billing/invoices";`,
  },
  {
    allows: "the domain applies another module's published constants (M10, conformist)",
    path: "items/domain/item-billing.ts",
    text: `import { INVOICE_STATES } from "@module/billing/invoices";`,
  },
  {
    allows: "a controller parses with another module's published schema (M10, conformist)",
    path: "module-controllers/items.controller.ts",
    text: `import { invoiceIdSchema } from "@module/billing/invoices";`,
  },
  {
    allows: "the vocabulary builds on another module's vocabulary (M10, conformist)",
    path: VOCABULARY,
    text: `import { invoiceIdSchema } from "@module/billing/invoices";`,
  },
  {
    allows: "contracts.ts re-exports another module's types",
    path: "contracts.ts",
    text: `export type { Invoice } from "@module/billing/contracts";`,
  },
  {
    allows: "index.ts wires another module",
    path: "index.ts",
    text: `import { createBillingModule } from "@module/billing";`,
  },
  {
    allows: "the logger writes to stderr, which is not the environment",
    check: checkNoEnvironment,
    path: "logger.ts",
    text: `import { stderr } from "node:process";\nexport const write = (line: string) => process.stderr.write(line);`,
  },
];

describe("each allowance of the standard is allowed", () => {
  it.each(allowances)("$allows", ({ check = checkLayers, path, text }) => {
    expect(check([{ path, text }], vocabularyFiles)).toEqual([]);
  });
});
