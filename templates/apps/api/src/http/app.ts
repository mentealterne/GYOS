// The HTTP app: probes, the JSON body parser, the modules' routes, and the error middleware.
// It takes the routes already built (routes/index.ts builds them from the modules), so a test can
// start it with one module's routes on a fake of that module.
import express, { type Express, type Router } from "express";
import type { Logger } from "../logger.ts";
import { errorHandler, notFound } from "./errors.ts";

export interface AppDeps {
  /** Every module's routes: createRoutes(modules) from routes/index.ts. */
  routes: Router;
  /**
   * Resolves while the app may take traffic: every module is ready and the process is not
   * shutting down. GET /ready answers from it.
   */
  ready: () => Promise<void>;
  logger: Logger;
}

/** The largest JSON body the app reads. A larger one is refused with 413. */
export const BODY_LIMIT = "100kb";

export function createApp({ routes, ready, logger }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

  // Liveness: the process answers. It checks nothing else, so a slow database never gets a
  // healthy process restarted.
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  // Readiness: every module's ready() has resolved, and the process is not shutting down.
  app.get("/ready", async (_request, response) => {
    try {
      await ready();
      response.json({ status: "ready" });
    } catch (error) {
      logger.warn("not ready", { reason: error instanceof Error ? error.message : String(error) });
      response.status(503).json({ status: "not-ready" });
    }
  });

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(routes);
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
