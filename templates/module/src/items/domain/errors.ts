import type { ItemErrorCode } from "../../items-vocabulary.ts";

/**
 * An expected refusal: the host maps `code` to an HTTP status, a job outcome or an exit code.
 * Exported as a class from the root entry and as a type from "./contracts".
 */
export class SampleItemError extends Error {
  readonly code: ItemErrorCode;

  constructor(code: ItemErrorCode, message: string) {
    super(message);
    this.name = "SampleItemError";
    this.code = code;
  }
}

export function duplicateName(name: string): SampleItemError {
  return new SampleItemError("duplicate-name", `An item called "${name}" already exists.`);
}

export function itemNotFound(itemId: string): SampleItemError {
  return new SampleItemError("not-found", `No item with id ${itemId}.`);
}
