// The published language of the items area: constants, unions and zod schemas.
// No I/O. Consumers import it as "@module/sample/items".
import { z } from "zod";

export const ITEM_NAME_MAX_LENGTH = 100;

/** An item's name: surrounding spaces are dropped, then 1 to 100 characters remain. */
export const itemNameSchema = z.string().trim().min(1).max(ITEM_NAME_MAX_LENGTH);

/**
 * Who the data belongs to. Opaque to this module: another module, or the host, owns tenants. An
 * opaque id is never rewritten, so one with surrounding whitespace is refused, not trimmed: a
 * trimmed id would name a different tenant than the one the caller holds.
 */
export const tenantIdSchema = z
  .string()
  .min(1)
  .refine((id) => id.trim() === id, { message: "A tenant id has no surrounding whitespace." });

export const itemIdSchema = z.uuid();

export const createItemInputSchema = z.object({ name: itemNameSchema });
export type CreateItemInput = z.input<typeof createItemInputSchema>;

export const renameItemInputSchema = z.object({ name: itemNameSchema });
export type RenameItemInput = z.input<typeof renameItemInputSchema>;

/** Why an operation on items was refused. */
export const ITEM_ERROR_CODES = ["duplicate-name", "not-found"] as const;
export type ItemErrorCode = (typeof ITEM_ERROR_CODES)[number];
