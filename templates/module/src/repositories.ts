// Builds every adapter on the module's connection, and the transaction seam. Swapping a
// technology is one line here. The in-memory twin is features/support/in-memory-repositories.ts,
// and src/tests/contract/ proves the two behave alike.
import type { SampleDatabase } from "./db/database.ts";
import { createPostgresItemRepository } from "./items/adapters/item-repository.postgres.ts";
import type { ItemRepository } from "./items/ports.ts";

export interface SampleRepositories {
  items: ItemRepository;
  /**
   * Runs `work` with every repository bound to one database transaction: its writes commit
   * together when it resolves, and none of them remains when it rejects. A use case whose writes
   * must land together receives this, and writes only through the repositories it is given.
   * Called again inside `work`, it opens a savepoint.
   */
  transaction<T>(work: (repositories: SampleRepositories) => Promise<T>): Promise<T>;
}

export function createSampleRepositories(db: SampleDatabase): SampleRepositories {
  return {
    items: createPostgresItemRepository(db),
    transaction: (work) => db.transaction((tx) => work(createSampleRepositories(tx))),
  };
}
