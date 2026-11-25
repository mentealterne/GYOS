import { describe, expect, it } from "vitest";
import { createInMemoryItemRepository } from "../../../../features/support/in-memory-item-repository.ts";
import type { ItemRepository } from "../../../items/ports.ts";
import { createItemService } from "../../../items/services/item-service.ts";
import { createFallbackLogger } from "../../../logger.ts";

const ACME = "tenant-acme";
const GLOBEX = "tenant-globex";

function setup(items: ItemRepository = createInMemoryItemRepository()) {
  let minutes = 0;
  const clock = () => new Date(Date.UTC(2026, 0, 5, 9, minutes++));
  const service = createItemService({ items, clock, logger: createFallbackLogger({}, () => {}) });
  return { service, items };
}

describe("item service", () => {
  it("creates an item stamped with the injected clock", async () => {
    const { service } = setup();
    const item = await service.create(ACME, "Blue widget");
    expect(item).toMatchObject({ tenantId: ACME, name: "Blue widget" });
    expect(item.createdAt.toISOString()).toBe("2026-01-05T09:00:00.000Z");
  });

  it("refuses a second item with the same name in the same tenant", async () => {
    const { service } = setup();
    await service.create(ACME, "Blue widget");
    await expect(service.create(ACME, "Blue widget")).rejects.toMatchObject({ code: "duplicate-name" });
  });

  it("keeps tenants apart", async () => {
    const { service } = setup();
    await service.create(ACME, "Blue widget");
    await service.create(GLOBEX, "Blue widget");
    expect(await service.list(ACME)).toHaveLength(1);
    expect(await service.list(GLOBEX)).toHaveLength(1);
  });

  it("refuses when the repository reports the name taken after the check (a lost race)", async () => {
    const inner = createInMemoryItemRepository();
    const racing: ItemRepository = { ...inner, findByName: async () => null };
    const { service } = setup(racing);
    await service.create(ACME, "Blue widget");
    await expect(service.create(ACME, "Blue widget")).rejects.toMatchObject({ code: "duplicate-name" });
  });

  it("renames an item and stamps the change", async () => {
    const { service } = setup();
    const item = await service.create(ACME, "Blue widget");
    const renamed = await service.rename(ACME, item.id, "Navy widget");
    expect(renamed).toMatchObject({ id: item.id, name: "Navy widget" });
    expect(renamed.updatedAt.getTime()).toBeGreaterThan(item.updatedAt.getTime());
  });

  it("refuses to rename onto a name in use", async () => {
    const { service } = setup();
    await service.create(ACME, "Blue widget");
    const green = await service.create(ACME, "Green widget");
    await expect(service.rename(ACME, green.id, "Blue widget")).rejects.toMatchObject({
      code: "duplicate-name",
    });
  });

  it("does not find another tenant's item", async () => {
    const { service } = setup();
    const item = await service.create(ACME, "Blue widget");
    await expect(service.rename(GLOBEX, item.id, "Navy widget")).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
