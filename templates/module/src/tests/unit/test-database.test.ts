// The integration tests wipe this module's schema: they must refuse any database but a throwaway one.
import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../integration/database.ts";

describe("the integration tests' database", () => {
  it("is read from TEST_DATABASE_URL, never DATABASE_URL", () => {
    expect(() => testDatabaseUrl({ DATABASE_URL: "postgres://localhost/app_test" })).toThrow(
      "TEST_DATABASE_URL is not set",
    );
  });

  it.each(["postgres://localhost/app_test", "postgres://u:p@db:5432/gyos_verify_1?sslmode=disable", "postgres://localhost/TestDb"])(
    "accepts %s",
    (url) => {
      expect(testDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
    },
  );

  it.each(["postgres://localhost/app", "postgres://localhost/postgres", "postgres://test-host/app", "postgres://localhost"])(
    "refuses %s, whose name doesn't say it is a throwaway database",
    (url) => {
      expect(() => testDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(/only run on a database whose name contains/);
    },
  );

  it("refuses a value that is not a URL", () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: "host=localhost dbname=app_test" })).toThrow(
      "not a postgres:// URL",
    );
  });
});
