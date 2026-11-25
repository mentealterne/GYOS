// A fresh World per scenario: in-memory adapters and the controllers wired on them, the same
// wiring index.ts does with the Postgres adapters.
import { setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import { createFallbackLogger } from "../../src/logger.ts";
import {
  createSampleControllers,
  type SampleControllers,
} from "../../src/module-controllers/index.ts";
import { createInMemoryItemRepository, type InMemoryItemRepository } from "./in-memory-item-repository.ts";

export class SampleWorld extends World {
  now = new Date("2026-01-05T09:00:00.000Z");
  readonly items: InMemoryItemRepository = createInMemoryItemRepository();
  readonly controllers: SampleControllers;
  /** Tenants are named in scenarios ("Acme"); their ids are opaque strings. */
  readonly tenants = new Map<string, string>();
  /** The refusal the last action ended with, if any. */
  lastError: unknown = undefined;

  constructor(options: IWorldOptions) {
    super(options);
    this.controllers = createSampleControllers({
      repositories: { items: this.items },
      clock: () => this.tick(),
      logger: createFallbackLogger(),
    });
  }

  tenantId(tenant: string): string {
    let id = this.tenants.get(tenant);
    if (id === undefined) {
      id = `tenant-${tenant.toLowerCase()}`;
      this.tenants.set(tenant, id);
    }
    return id;
  }

  /** Every call moves the clock one minute on, so items keep the order they were added in. */
  tick(): Date {
    this.now = new Date(this.now.getTime() + 60_000);
    return this.now;
  }

  async attempt(action: () => Promise<unknown>): Promise<void> {
    this.lastError = undefined;
    try {
      await action();
    } catch (error) {
      this.lastError = error;
    }
  }
}

setWorldConstructor(SampleWorld);
