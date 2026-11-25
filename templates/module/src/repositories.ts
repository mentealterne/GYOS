// Builds every adapter on the module's connection. Swapping a technology is one line here.
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createPostgresItemRepository } from "./items/adapters/item-repository.postgres.ts";
import type { ItemRepository } from "./items/ports.ts";

export interface SampleRepositories {
  items: ItemRepository;
}

export function createSampleRepositories(db: NodePgDatabase): SampleRepositories {
  return {
    items: createPostgresItemRepository(db),
  };
}
