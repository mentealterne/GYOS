// Every repository in memory, and the transaction seam: the twin of src/repositories.ts. The
// scenarios and the unit tests wire the controllers on it, and src/tests/contract/ proves it
// keeps the same promises as the Postgres one.
import type { SampleRepositories } from "../../src/repositories.ts";
import { createInMemoryItemRepository, type InMemoryItemRepository } from "./in-memory-item-repository.ts";

export interface InMemorySampleRepositories extends SampleRepositories {
  items: InMemoryItemRepository;
}

/**
 * The transaction keeps the promise a use case relies on: when `work` rejects, none of its writes
 * remains, and a transaction inside it rolls back alone, like a savepoint. It doesn't isolate
 * concurrent work from each other, which a scenario never runs.
 */
export function createInMemorySampleRepositories(): InMemorySampleRepositories {
  const repositories: InMemorySampleRepositories = {
    items: createInMemoryItemRepository(),
    async transaction(work) {
      const before = repositories.items.all();
      try {
        return await work(repositories);
      } catch (error) {
        repositories.items.restore(before);
        throw error;
      }
    },
  };
  return repositories;
}
