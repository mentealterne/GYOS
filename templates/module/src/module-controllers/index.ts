// Builds the use cases and the controllers on a set of repositories. index.ts calls it with the
// Postgres adapters; the scenarios and unit tests call it with the in-memory ones.
import { createItemService, type ItemServiceDeps } from "../items/services/item-service.ts";
import { createItemsController, type ItemsController } from "./items.controller.ts";

export interface SampleControllerDeps {
  repositories: { items: ItemServiceDeps["items"] };
  clock: ItemServiceDeps["clock"];
  logger: ItemServiceDeps["logger"];
}

export interface SampleControllers {
  items: ItemsController;
}

export function createSampleControllers({
  repositories,
  clock,
  logger,
}: SampleControllerDeps): SampleControllers {
  return {
    items: createItemsController(createItemService({ items: repositories.items, clock, logger })),
  };
}
