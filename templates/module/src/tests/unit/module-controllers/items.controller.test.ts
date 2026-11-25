import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createInMemoryItemRepository } from "../../../../features/support/in-memory-item-repository.ts";
import { createFallbackLogger } from "../../../logger.ts";
import { createSampleControllers } from "../../../module-controllers/index.ts";

const ACME = "tenant-acme";

function controller() {
  return createSampleControllers({
    repositories: { items: createInMemoryItemRepository() },
    clock: () => new Date("2026-01-05T09:00:00.000Z"),
    logger: createFallbackLogger({}, () => {}),
  }).items;
}

describe("items controller: input parsing", () => {
  it("trims the name", async () => {
    const item = await controller().create(ACME, { name: "  Blue widget  " });
    expect(item.name).toBe("Blue widget");
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a blank name", { name: "   " }],
    ["a name of 101 characters", { name: "x".repeat(101) }],
    ["a missing name", {}],
    ["a name that is not a string", { name: 42 }],
  ])("refuses %s", async (_label, input) => {
    await expect(controller().create(ACME, input)).rejects.toBeInstanceOf(ZodError);
  });

  it("accepts a name of exactly 100 characters", async () => {
    const item = await controller().create(ACME, { name: "x".repeat(100) });
    expect(item.name).toHaveLength(100);
  });

  it.each([
    ["an empty tenant id", ""],
    ["a blank tenant id", "  "],
    ["a tenant id with surrounding spaces", " tenant-acme "],
    ["a tenant id with a trailing newline", "tenant-acme\n"],
  ])("refuses %s, rather than rewrite it", async (_label, tenantId) => {
    await expect(controller().list(tenantId)).rejects.toBeInstanceOf(ZodError);
  });

  it("passes a tenant id through as it is", async () => {
    expect((await controller().create("Acme Ltd", { name: "Blue widget" })).tenantId).toBe("Acme Ltd");
  });

  it("refuses an item id that is not a uuid", async () => {
    await expect(controller().rename(ACME, "item-1", { name: "Navy widget" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
