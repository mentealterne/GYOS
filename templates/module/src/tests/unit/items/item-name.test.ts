import { describe, expect, it } from "vitest";
import { SampleItemError } from "../../../items/domain/errors.ts";
import type { Item } from "../../../items/domain/item.ts";
import { ensureNameIsFree } from "../../../items/domain/item-name.ts";

const at = new Date("2026-01-05T09:00:00.000Z");
const blueWidget: Item = {
  id: "7b0c7a43-6f4b-4e0e-9d1b-1f3f5f2a9c11",
  tenantId: "tenant-acme",
  name: "Blue widget",
  createdAt: at,
  updatedAt: at,
};

describe("rule: a name is used by at most one item of a tenant", () => {
  it("accepts a name nobody holds", () => {
    expect(() => ensureNameIsFree("Blue widget", null)).not.toThrow();
  });

  it("refuses a name another item holds", () => {
    expect(() => ensureNameIsFree("Blue widget", blueWidget)).toThrowError(
      expect.objectContaining({ code: "duplicate-name" }),
    );
    expect(() => ensureNameIsFree("Blue widget", blueWidget)).toThrow(SampleItemError);
  });

  it("lets an item keep its own name", () => {
    expect(() => ensureNameIsFree("Blue widget", blueWidget, blueWidget.id)).not.toThrow();
  });
});
