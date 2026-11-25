// The integration tests create and drop databases next to TEST_DATABASE_URL's: they refuse one
// that is not named for tests, before connecting to anything.
import { describe, expect, it } from "vitest";
import { testDatabaseUrl } from "../integration/database.ts";

describe("testDatabaseUrl", () => {
  it.each(["product_test", "gyos_verify_1795634358918_21395", "PRODUCT_TEST", "test-orders", "test"])(
    "accepts a database named for tests: %s",
    (name) => {
      expect(testDatabaseUrl({ TEST_DATABASE_URL: `postgres://localhost:5432/${name}` }).pathname).toBe(`/${name}`);
    },
  );

  it.each(["product", "postgres", "latest", "contest", "product_testing", "verifyme"])(
    "refuses one that is not: %s",
    (name) => {
      expect(() => testDatabaseUrl({ TEST_DATABASE_URL: `postgres://localhost:5432/${name}` })).toThrow(
        /only run on a database whose name has "test" or "verify" as a word of its own/,
      );
    },
  );

  it("refuses to guess when it is not set", () => {
    expect(() => testDatabaseUrl({})).toThrow(/TEST_DATABASE_URL is not set/);
  });
});
