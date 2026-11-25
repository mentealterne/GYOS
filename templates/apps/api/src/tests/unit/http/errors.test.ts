// How a route file maps a module's errors: input errors by the module's predicate, refusals by
// class and code. Synthetic errors stand in for a module's here; the generated test of each
// module's routes uses the module's own.
import { Router } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { moduleErrors, refusals, type InputIssue } from "../../../http/errors.ts";
import { startApp, type TestApp } from "../../support/test-app.ts";

class InvalidInput extends Error {
  readonly issues: InputIssue[];

  constructor(issues: InputIssue[]) {
    super("invalid input");
    this.issues = issues;
  }
}

class InvoiceError extends Error {
  readonly code: "not-found" | "already-paid" | "over-limit";

  constructor(code: InvoiceError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Another module's refusal class, which this module's map doesn't name. */
class OtherModuleError extends Error {
  readonly code = "not-found";
}

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function throwing(error: unknown): Promise<TestApp> {
  const router = Router();
  router.get("/invoices", () => {
    throw error;
  });
  router.use(
    moduleErrors({
      isInputError: (candidate): candidate is InvalidInput => candidate instanceof InvalidInput,
      refusals: [refusals(InvoiceError, { "not-found": 404, "already-paid": 409, "over-limit": 422 })],
    }),
  );
  return startApp({ routes: router });
}

describe("a module's errors", () => {
  it("invalid input: 400, with every issue", async () => {
    app = await throwing(
      new InvalidInput([
        { path: ["name"], message: "Too small" },
        { path: ["lines", 0, Symbol("internal")], message: "Required" },
      ]),
    );
    expect(await app.request("GET", "/invoices")).toMatchObject({
      status: 400,
      body: {
        error: {
          code: "invalid-input",
          issues: [
            { path: ["name"], message: "Too small" },
            { path: ["lines", 0], message: "Required" },
          ],
        },
      },
    });
  });

  it.each([
    ["not-found", 404],
    ["already-paid", 409],
    ["over-limit", 422],
  ] as const)("a refusal with code %s: %i, with the module's code and message", async (code, status) => {
    app = await throwing(new InvoiceError(code, `Refused: ${code}.`));
    expect(await app.request("GET", "/invoices")).toMatchObject({
      status,
      body: { error: { code, message: `Refused: ${code}.` } },
    });
  });

  it("a refusal class the route file doesn't map is a bug: 500", async () => {
    app = await throwing(new OtherModuleError("No such thing."));
    expect(await app.request("GET", "/invoices")).toMatchObject({ status: 500, body: { error: { code: "internal" } } });
  });

  it("a refusal map names every code of the class", () => {
    // @ts-expect-error: "over-limit" has no status.
    refusals(InvoiceError, { "not-found": 404, "already-paid": 409 });
    // @ts-expect-error: 500 is not a refusal's status.
    refusals(InvoiceError, { "not-found": 404, "already-paid": 409, "over-limit": 500 });
  });
});
