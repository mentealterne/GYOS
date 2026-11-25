// Every module's routes, each under its own path: /<module-name>/… . A route file per module, in
// this folder, maps HTTP onto that module's controllers and its errors onto statuses.
//
// scripts/new-module.ts --host adds a module here, one line right above each gyos:routes:*
// marker. Keep the markers.
import { Router } from "express";
import type { Modules } from "../../modules.ts";
// gyos:routes:imports

export function createRoutes(modules: Modules): Router {
  const router = Router();
  // gyos:routes:mount
  return router;
}
