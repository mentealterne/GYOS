// Every module, built and readied the way main.ts does it, on an empty database: they all
// migrate at once, and the app reports ready only then.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRoutes } from "../../http/routes/index.ts";
import { buildModules, modulesReady, type Modules } from "../../modules.ts";
import { recordingLogger, startApp, type TestApp } from "../support/test-app.ts";
import { createScratchDatabase, type ScratchDatabase } from "./database.ts";

let database: ScratchDatabase | undefined;
let pool: pg.Pool | undefined;
let modules: Modules;
let app: TestApp | undefined;

beforeAll(async () => {
  database = await createScratchDatabase("api");
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
  modules = buildModules({ pool, logger: recordingLogger(), clock: () => new Date() });
  app = await startApp({ routes: createRoutes(modules), ready: () => modulesReady(modules) });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await database?.drop();
});

describe("on an empty database", () => {
  it("every module gets ready, and so does the app", async () => {
    await expect(modulesReady(modules)).resolves.toBeUndefined();
    expect(await app?.request("GET", "/ready")).toMatchObject({ status: 200, body: { status: "ready" } });
  });

  it("serves the probes", async () => {
    expect(await app?.request("GET", "/health")).toMatchObject({ status: 200 });
  });
});
