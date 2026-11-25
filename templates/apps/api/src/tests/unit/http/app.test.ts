// What the app does around the modules' routes: the probes, the body parser, the host's own
// refusals, a route that doesn't exist, and a bug.
import { Router } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { HttpError } from "../../../http/errors.ts";
import { TENANT_HEADER, tenantOf } from "../../../http/tenant.ts";
import { startApp, type TestApp } from "../../support/test-app.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A route for each case: it echoes the tenant and the body, or throws what it is told to. */
function testRoutes(): Router {
  const router = Router();
  router.post("/echo", (request, response) => {
    response.json({ tenantId: tenantOf(request), body: request.body });
  });
  router.get("/teapot", () => {
    throw new HttpError(418, "teapot", "I'm a teapot.");
  });
  router.get("/bug", async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.7:5432 as admin");
  });
  router.get("/thrown-string", () => {
    throw "not an Error";
  });
  router.get("/things/:thingId", (request, response) => {
    response.json({ thingId: request.params.thingId });
  });
  router.get("/forbidden", () => {
    throw Object.assign(new Error("tenant globex belongs to someone else"), { status: 403 });
  });
  router.get("/half-sent", (_request, response) => {
    response.status(200).type("json").write('{"items": [');
    throw new Error("the cursor broke after the first page");
  });
  return router;
}

describe("the probes", () => {
  it("GET /health answers while the process runs", async () => {
    app = await startApp({ ready: () => Promise.reject(new Error("migrating")) });
    expect(await app.request("GET", "/health")).toMatchObject({ status: 200, body: { status: "ok" } });
  });

  it("GET /ready answers 200 once every module is ready", async () => {
    app = await startApp({ ready: async () => {} });
    expect(await app.request("GET", "/ready")).toMatchObject({ status: 200, body: { status: "ready" } });
  });

  it("GET /ready answers 503 while they are not, or while shutting down", async () => {
    app = await startApp({ ready: () => Promise.reject(new Error("shutting down")) });
    expect(await app.request("GET", "/ready")).toMatchObject({ status: 503, body: { status: "not-ready" } });
  });
});

describe("requests the host refuses", () => {
  it("a route that doesn't exist: 404", async () => {
    app = await startApp({ routes: testRoutes() });
    expect(await app.request("GET", "/nowhere")).toMatchObject({
      status: 404,
      body: { error: { code: "route-not-found", message: "No route for GET /nowhere." } },
    });
  });

  it("a body that is not JSON: 400", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("POST", "/echo", { headers: { [TENANT_HEADER]: "acme" }, raw: "{ name: " });
    expect(response).toMatchObject({ status: 400, body: { error: { code: "invalid-json" } } });
  });

  it("a body over the limit: 413", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("POST", "/echo", {
      headers: { [TENANT_HEADER]: "acme" },
      json: { name: "x".repeat(200_000) },
    });
    expect(response).toMatchObject({ status: 413, body: { error: { code: "payload-too-large" } } });
  });

  it("no tenant: 400, before any module is called", async () => {
    app = await startApp({ routes: testRoutes() });
    expect(await app.request("POST", "/echo", { json: { name: "Blue widget" } })).toMatchObject({
      status: 400,
      body: { error: { code: "missing-tenant" } },
    });
  });

  it("the tenant and the JSON body reach the route", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("POST", "/echo", { headers: { [TENANT_HEADER]: "acme" }, json: { name: "Blue" } });
    expect(response).toMatchObject({ status: 200, body: { tenantId: "acme", body: { name: "Blue" } } });
  });

  it("a path parameter with malformed percent-encoding: 400, with a fixed message", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("GET", "/things/%E0%A4%A");
    expect(response).toMatchObject({
      status: 400,
      body: { error: { code: "bad-request", message: "The request is not valid." } },
    });
    expect(response.text).not.toMatch(/%E0|decode/);
    expect(app.logs.filter((entry) => entry.level === "error")).toEqual([]);
  });

  it("any error with a 4xx status: that status, and its message only when it says it may be shown", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("GET", "/forbidden");
    expect(response).toMatchObject({
      status: 403,
      body: { error: { code: "bad-request", message: "The request is not valid." } },
    });
    expect(response.text).not.toContain("globex");
  });

  it("an HttpError: its status, code and message", async () => {
    app = await startApp({ routes: testRoutes() });
    expect(await app.request("GET", "/teapot")).toMatchObject({
      status: 418,
      body: { error: { code: "teapot", message: "I'm a teapot." } },
    });
  });
});

describe("a bug", () => {
  it("answers 500 with an id, and nothing about the error", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("GET", "/bug");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "internal", message: "Something went wrong on our side.", id: expect.any(String) },
    });
    expect(response.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.7|admin|stack|at /);
  });

  it("is logged with the same id, the request and the error", async () => {
    app = await startApp({ routes: testRoutes() });
    const response = await app.request("GET", "/bug");
    const { id } = (response.body as { error: { id: string } }).error;
    expect(app.logs).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "connect ECONNREFUSED 10.0.0.7:5432 as admin",
        error: expect.any(Error),
        fields: { errorId: id, method: "GET", path: "/bug" },
      }),
    );
  });

  it("is logged even when the response has started, and the response is cut short", async () => {
    app = await startApp({ routes: testRoutes() });
    const text = await app.request("GET", "/half-sent").then(
      (response) => response.text,
      () => "(connection cut)",
    );
    expect(text).not.toMatch(/\]\s*\}$/);
    expect(app.logs).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "the cursor broke after the first page",
        fields: expect.objectContaining({ method: "GET", path: "/half-sent" }),
      }),
    );
  });

  it("is a 500 even when what was thrown is not an Error", async () => {
    app = await startApp({ routes: testRoutes() });
    expect(await app.request("GET", "/thrown-string")).toMatchObject({ status: 500, body: { error: { code: "internal" } } });
    expect(app.logs).toContainEqual(expect.objectContaining({ level: "error", message: "not an Error" }));
  });
});
