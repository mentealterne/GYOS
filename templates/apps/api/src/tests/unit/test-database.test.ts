// The integration tests create and drop databases next to TEST_DATABASE_URL's: they refuse one
// that is not named for tests, before connecting to anything.
import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../integration/database.ts";

describe("testDatabaseUrl", () => {
  it("accepts a database named for tests", () => {
    expect(testDatabaseUrl({ TEST_DATABASE_URL: "postgres://localhost:5432/product_test" }).pathname).toBe(
      "/product_test",
    );
  });

  it("refuses one that is not", () => {
    expect(() => testDatabaseUrl({ TEST_DATABASE_URL: "postgres://localhost:5432/product" })).toThrow(
      /only run on a database whose name contains "test" or "verify"/,
    );
  });

  it("refuses to guess when it is not set", () => {
    expect(() => testDatabaseUrl({})).toThrow(/TEST_DATABASE_URL is not set/);
  });
});
