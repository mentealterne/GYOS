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

  it("refuses a blank tenant id", async () => {
    await expect(controller().list("  ")).rejects.toBeInstanceOf(ZodError);
  });

  it("refuses an item id that is not a uuid", async () => {
    await expect(controller().rename(ACME, "item-1", { name: "Navy widget" })).rejects.toBeInstanceOf(
      ZodError,
    );
  });
});
