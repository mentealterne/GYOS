// The HTTP routes of @module/sample, mounted at /sample by routes/index.ts. Thin: each route reads
// the request, calls one operation of the module's controllers, and shapes the response. The
// module parses and validates the input; this file only maps its errors onto statuses.
import { Router } from "express";
import { isSampleInputError, SampleItemError, type SampleModule } from "@module/sample";
import { moduleErrors, refusals } from "../errors.ts";
import { tenantOf } from "../tenant.ts";

export function createSampleRoutes(controllers: SampleModule): Router {
  const router = Router();

  router.get("/items", async (request, response) => {
    const items = await controllers.items.list(tenantOf(request));
    response.json({ items });
  });

  router.post("/items", async (request, response) => {
    const item = await controllers.items.create(tenantOf(request), request.body);
    response.status(201).json(item);
  });

  router.patch("/items/:itemId", async (request, response) => {
    const item = await controllers.items.rename(tenantOf(request), request.params.itemId, request.body);
    response.json(item);
  });

  router.use(
    moduleErrors({
      isInputError: isSampleInputError,
      // Every code the module can refuse with, and its status. A new code doesn't compile until
      // it is mapped here.
      refusals: [refusals(SampleItemError, { "duplicate-name": 409, "not-found": 404 })],
    }),
  );
  return router;
}
