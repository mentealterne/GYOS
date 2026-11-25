// How a host recognises invalid input. The root entry exports it, so a host maps the refusal to
// its transport (a 400, a failed job) without importing zod or knowing the module uses it.
import { ZodError } from "zod";

/** Whether `error` is this module refusing invalid input: what a controller's parse throws. */
export function isSampleInputError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}
