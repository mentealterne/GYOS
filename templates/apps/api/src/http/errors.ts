// How errors become HTTP responses (standards/host.md). Four kinds, each mapped in one place:
// - a module's invalid input, recognised by its is<Name>InputError → 400, with the issues;
// - a module's expected refusal, a typed error class with a code → the status its route file
//   gives that code: 404, 409 or 422;
// - the host's own refusal of a request, an HttpError, or the JSON parser's → its 4xx status;
// - anything else is a bug → 500, logged with an id that the response carries, and nothing else
//   about it in the response.
// Every error response has one shape: { "error": { "code", "message", "issues"?, "id"? } }.
import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler, Response } from "express";
import type { Logger } from "../logger.ts";

/** The statuses a module's refusal may map to. */
export type RefusalStatus = 404 | 409 | 422;

/** One problem with the input, as a module's input error reports it (a zod issue, for example). */
export interface InputIssue {
  path: readonly PropertyKey[];
  message: string;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    issues?: { path: (string | number)[]; message: string }[];
    id?: string;
  };
}

/** The host refusing a request before any module sees it: a missing header, a bad parameter. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

/** A module's refusal class, and the status of each of its codes. */
export interface Refusals {
  /** The status, code and message of `error`, when it is one of these refusals. */
  match(error: unknown): { status: RefusalStatus; code: string; message: string } | undefined;
}

/**
 * Maps a module's refusal class to statuses, code by code. The map must name every code the class
 * can carry: a code the module adds later doesn't compile until it is mapped here.
 */
export function refusals<Code extends string>(
  errorClass: abstract new (...args: never[]) => Error & { readonly code: Code },
  statusByCode: NoInfer<Readonly<Record<Code, RefusalStatus>>>,
): Refusals {
  return {
    match: (error) =>
      error instanceof errorClass
        ? { status: statusByCode[error.code], code: error.code, message: error.message }
        : undefined,
  };
}

export interface ModuleErrors {
  /** The module's is<Name>InputError, exported from its root entry. */
  isInputError: (error: unknown) => error is { issues: readonly InputIssue[] };
  /** The module's refusal classes, each with its map of statuses. */
  refusals: readonly Refusals[];
}

/**
 * The error middleware a route file mounts after its routes: it answers a module's invalid input
 * and refusals, and passes anything else on to errorHandler.
 */
export function moduleErrors(errors: ModuleErrors): ErrorRequestHandler {
  return (error, _request, response, next) => {
    if (errors.isInputError(error)) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.filter((key): key is string | number => typeof key !== "symbol"),
        message: issue.message,
      }));
      send(response, 400, { error: { code: "invalid-input", message: "The request is not valid.", issues } });
      return;
    }
    for (const refusals of errors.refusals) {
      const refused = refusals.match(error);
      if (refused !== undefined) {
        send(response, refused.status, { error: { code: refused.code, message: refused.message } });
        return;
      }
    }
    next(error);
  };
}

/** No route matched. */
export const notFound: RequestHandler = (request, response) => {
  send(response, 404, {
    error: { code: "route-not-found", message: `No route for ${request.method} ${request.path}.` },
  });
};

/** The last middleware: the host's own refusals, the parser's, and every bug. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, next) => {
    // The response has started: Express's default handler ends the connection.
    if (response.headersSent) {
      next(error);
      return;
    }
    const refused = clientError(error);
    if (refused !== undefined) {
      send(response, refused.status, { error: { code: refused.code, message: refused.message } });
      return;
    }
    const id = randomUUID();
    logger.error(error instanceof Error ? error : new Error(String(error)), {
      errorId: id,
      method: request.method,
      path: request.path,
    });
    send(response, 500, { error: { code: "internal", message: "Something went wrong on our side.", id } });
  };
}

const PARSER_CODES: Record<string, string> = {
  "entity.parse.failed": "invalid-json",
  "entity.too.large": "payload-too-large",
  "charset.unsupported": "unsupported-charset",
  "encoding.unsupported": "unsupported-encoding",
};

/**
 * An HttpError, or an error that says it may be shown to the client: http-errors' convention,
 * which Express's JSON parser follows (a 4xx `status` and `expose: true`).
 */
function clientError(error: unknown): { status: number; code: string; message: string } | undefined {
  if (error instanceof HttpError) return { status: error.status, code: error.code, message: error.message };
  if (typeof error !== "object" || error === null) return undefined;
  const { status, expose, type, message } = error as { status?: unknown; expose?: unknown; type?: unknown; message?: unknown };
  if (typeof status !== "number" || status < 400 || status > 499 || expose !== true) return undefined;
  const code = (typeof type === "string" ? PARSER_CODES[type] : undefined) ?? "bad-request";
  return { status, code, message: typeof message === "string" ? message : "Bad request." };
}

function send(response: Response, status: number, body: ErrorBody): void {
  response.status(status).json(body);
}
