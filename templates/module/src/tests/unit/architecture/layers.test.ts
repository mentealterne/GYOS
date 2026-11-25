// The layer rules on the real source, and next to each rule a synthetic file that breaks it:
// a check that cannot fail proves nothing.
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

const cases: Case[] = [
  {
    breaks: "a controller doesn't query",
    path: "module-controllers/bad.controller.ts",
    text: `import { createPostgresItemRepository } from "../items/adapters/item-repository.postgres.ts";`,
    rule: "controllers",
  },
  {
    breaks: "a controller doesn't touch db/",
    path: "module-controllers/bad.controller.ts",
    text: `import { items } from "../db/schema.ts";`,
    rule: "controllers",
  },
  {
    breaks: "no transport types in the module",
    path: "module-controllers/bad.controller.ts",
    text: `import type { Request } from "express";`,
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
    text: `import type { Order } from "../../orders/domain/order.ts";`,
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
    text: `import { items } from "../../db/schema.ts";`,
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
    path: "orders/adapters/order-store.postgres.ts",
    text: `import { createPostgresItemRepository } from "../../items/adapters/item-repository.postgres.ts";`,
    rule: "adapters",
  },
  {
    breaks: "ports hold no implementation",
    path: "items/ports.ts",
    text: `import type { X } from "./adapters/item-repository.postgres.ts";`,
    rule: "ports",
  },
  {
    breaks: "the vocabulary does no I/O",
    path: VOCABULARY,
    text: `import pg from "pg";`,
    rule: "vocabulary",
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
  {
    breaks: "nothing in the module reads process.env",
    check: checkNoEnvironment,
    path: "config/bad.ts",
    text: `export const url = process.env.DATABASE_URL;`,
    rule: "no-env",
  },
  {
    breaks: "nothing in the module reads process.env, however it is spelled",
    check: checkNoEnvironment,
    path: "db/bad.ts",
    text: `export const url = process["env"].DATABASE_URL;`,
    rule: "no-env",
  },
];

describe("each rule reports a synthetic violation", () => {
  it.each(cases)("$breaks", ({ check = checkLayers, path, text, rule }) => {
    const violations = check([{ path, text }], vocabularyFiles);
    expect(violations).toContainEqual(expect.objectContaining({ rule, file: path }));
  });
});
