// The operations a host calls on items: parse the raw input, then call one use case.
// Invalid input throws a ZodError, which isSampleInputError() recognises; the host maps it, like
// every other error, to its transport.
import {
  createItemInputSchema,
  itemIdSchema,
  renameItemInputSchema,
  tenantIdSchema,
} from "../items-vocabulary.ts";
import type { Item, ItemService } from "../items/services/item-service.ts";

export interface ItemsController {
  create(tenantId: string, input: unknown): Promise<Item>;
  list(tenantId: string): Promise<Item[]>;
  rename(tenantId: string, itemId: string, input: unknown): Promise<Item>;
}

export function createItemsController(service: ItemService): ItemsController {
  return {
    async create(tenantId, input) {
      const { name } = createItemInputSchema.parse(input);
      return service.create(tenantIdSchema.parse(tenantId), name);
    },

    async list(tenantId) {
      return service.list(tenantIdSchema.parse(tenantId));
    },

    async rename(tenantId, itemId, input) {
      const { name } = renameItemInputSchema.parse(input);
      return service.rename(tenantIdSchema.parse(tenantId), itemIdSchema.parse(itemId), name);
    },
  };
}
