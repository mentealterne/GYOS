// The tenant placeholder: a header, which is not authentication. It is checked before a module is
// called, and a production host refuses to start with it.
import { Router } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../../../config.ts";
import { checkTenantSource, TENANT_HEADER, TENANT_ID_MAX_LENGTH, tenantOf } from "../../../http/tenant.ts";
import { startApp, type TestApp } from "../../support/test-app.ts";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function echoTenant(): Promise<TestApp> {
  const router = Router();
  router.get("/whoami", (request, response) => {
    response.json({ tenantId: tenantOf(request) });
  });
  return startApp({ routes: router });
}

describe("checkTenantSource", () => {
  it("lets a development or test host read the tenant from the header", () => {
    expect(() => checkTenantSource({ environment: "development", tenantFromHeader: true })).not.toThrow();
    expect(() => checkTenantSource({ environment: "test", tenantFromHeader: true })).not.toThrow();
  });

  it.each([true, false])("refuses to start a production host on the placeholder (TENANT_FROM_HEADER %s)", (tenantFromHeader) => {
    const check = () => checkTenantSource({ environment: "production", tenantFromHeader });
    expect(check).toThrow(ConfigError);
    expect(check).toThrow(/not authentication/);
    expect(check).toThrow(/with your authentication/);
  });

  it("refuses to start with the placeholder turned off and nothing in its place", () => {
    expect(() => checkTenantSource({ environment: "development", tenantFromHeader: false })).toThrow(
      /TENANT_FROM_HEADER: false/,
    );
  });
});

describe("tenantOf", () => {
  it.each(["acme", "tenant-acme_2.eu", "3f2b8c1e-8d4a-4b7e-9a51-0c2d6e7f8a9b", "a".repeat(TENANT_ID_MAX_LENGTH)])(
    "reads %s from the header",
    async (tenantId) => {
      app = await echoTenant();
      expect(await app.request("GET", "/whoami", { headers: { [TENANT_HEADER]: tenantId } })).toMatchObject({
        status: 200,
        body: { tenantId },
      });
    },
  );

  it.each([
    ["missing", undefined, "missing-tenant"],
    ["empty", "", "missing-tenant"],
    ["too long", "a".repeat(TENANT_ID_MAX_LENGTH + 1), "invalid-tenant"],
    ["with a space", "acme corp", "invalid-tenant"],
    ["with a slash", "acme/../globex", "invalid-tenant"],
    ["two of them, joined", "acme, globex", "invalid-tenant"],
  ])("refuses a header that is %s: 400", async (_case, tenantId, code) => {
    app = await echoTenant();
    const headers: Record<string, string> = tenantId === undefined ? {} : { [TENANT_HEADER]: tenantId };
    const response = await app.request("GET", "/whoami", { headers });
    expect(response).toMatchObject({ status: 400, body: { error: { code } } });
    if (tenantId !== undefined && tenantId !== "") expect(response.text).not.toContain(tenantId);
  });
});
