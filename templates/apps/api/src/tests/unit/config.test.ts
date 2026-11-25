import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../config.ts";

const DATABASE_URL = "postgres://app:s3cret@localhost:5432/product";

function problemsOf(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  throw new Error("expected a ConfigError");
}

describe("loadConfig", () => {
  it("needs only DATABASE_URL, and defaults the rest", () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      environment: "production",
      host: "0.0.0.0",
      port: 3000,
      databaseUrl: DATABASE_URL,
      databasePoolMax: 10,
      logLevel: "info",
      shutdownTimeoutMs: 10_000,
      tenantFromHeader: false,
    });
  });

  it("reads every variable", () => {
    const config = loadConfig({
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: "8080",
      DATABASE_URL: "postgresql://localhost/product",
      DATABASE_POOL_MAX: "4",
      LOG_LEVEL: "debug",
      SHUTDOWN_TIMEOUT_MS: "2500",
      TENANT_FROM_HEADER: "false",
    });
    expect(config).toEqual({
      environment: "development",
      host: "127.0.0.1",
      port: 8080,
      databaseUrl: "postgresql://localhost/product",
      databasePoolMax: 4,
      logLevel: "debug",
      shutdownTimeoutMs: 2500,
      tenantFromHeader: false,
    });
  });

  it("takes the tenant from the header by default outside production only", () => {
    expect(loadConfig({ DATABASE_URL, NODE_ENV: "development" }).tenantFromHeader).toBe(true);
    expect(loadConfig({ DATABASE_URL, NODE_ENV: "test" }).tenantFromHeader).toBe(true);
    expect(loadConfig({ DATABASE_URL, NODE_ENV: "production" }).tenantFromHeader).toBe(false);
    expect(loadConfig({ DATABASE_URL, NODE_ENV: "development", TENANT_FROM_HEADER: "false" }).tenantFromHeader).toBe(false);
    expect(loadConfig({ DATABASE_URL, NODE_ENV: "production", TENANT_FROM_HEADER: "true" }).tenantFromHeader).toBe(true);
  });

  it("lists every problem at once", () => {
    const problems = problemsOf({
      PORT: "eighty",
      LOG_LEVEL: "loud",
      DATABASE_POOL_MAX: "0",
      NODE_ENV: "staging",
      TENANT_FROM_HEADER: "yes",
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^PORT: /),
        expect.stringMatching(/^LOG_LEVEL: /),
        expect.stringMatching(/^DATABASE_POOL_MAX: /),
        expect.stringMatching(/^NODE_ENV: /),
        "TENANT_FROM_HEADER: expected true or false",
        "DATABASE_URL: is not set",
      ]),
    );
    expect(problems).toHaveLength(6);
  });

  it("refuses a URL that is not Postgres, and a port out of range", () => {
    expect(problemsOf({ DATABASE_URL: "mysql://localhost/product", PORT: "70000" })).toEqual([
      "PORT: expected a port, 0 to 65535",
      "DATABASE_URL: expected a postgres:// URL",
    ]);
  });

  it("treats an empty variable as not set", () => {
    expect(loadConfig({ DATABASE_URL, PORT: "", LOG_LEVEL: "" })).toMatchObject({ port: 3000, logLevel: "info" });
    expect(problemsOf({ DATABASE_URL: "" })).toEqual(["DATABASE_URL: is not set"]);
  });

  it("never echoes a value: the database URL holds a password", () => {
    const message = problemsOf({ DATABASE_URL: "mysql://app:s3cret@localhost/product", PORT: "s3cret" }).join("\n");
    expect(message).not.toContain("s3cret");
  });
});
