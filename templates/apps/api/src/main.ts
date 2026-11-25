// The composition root (standards/module.md, M1; standards/host.md). In order:
// configuration → logger → pool → every module, once → every module ready → listen.
// SIGTERM or SIGINT stops it gracefully: stop taking requests, let those in flight finish, close
// the server, end the pool, flush the logger. A second signal kills the process.
//
//   development:  node --conditions=@gyos/source src/main.ts   (pnpm dev: no build step)
//   production:   node dist/main.js                            (pnpm build, then pnpm start)
import type { Server } from "node:http";
import pg from "pg";
import { ConfigError, loadConfig } from "./config.ts";
import { createApp } from "./http/app.ts";
import { createRoutes } from "./http/routes/index.ts";
import { close, listen, portOf } from "./http/server.ts";
import { createLogger } from "./logger.ts";
import { buildModules, modulesReady } from "./modules.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const { logger, flush } = createLogger({
    level: config.logLevel,
    pretty: config.environment === "development",
  });
  // One pool for the process; every module builds on it. It must reach Postgres directly or
  // through a session-mode pooler: ready() holds a session-level advisory lock.
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.databasePoolMax });
  // An idle client that loses its connection emits here; unhandled, it would crash the process.
  pool.on("error", (error) => logger.error(error, { during: "an idle database connection" }));

  let server: Server | undefined;
  let stopping = false;

  const stop = async (reason: string, exitCode: number): Promise<void> => {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    logger.info("stopping", { reason });
    // The last resort, if closing hangs: exit anyway. unref() lets a clean stop exit before it.
    setTimeout(() => process.exit(1), config.shutdownTimeoutMs + 5_000).unref();
    try {
      if (server !== undefined && !(await close(server, config.shutdownTimeoutMs))) {
        logger.warn("cut connections still open at the shutdown timeout", { timeoutMs: config.shutdownTimeoutMs });
      }
      await pool.end();
      logger.info("stopped");
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), { during: "shutdown" });
      process.exitCode = 1;
    } finally {
      await flush();
    }
  };
  process.once("SIGTERM", () => void stop("SIGTERM", 0));
  process.once("SIGINT", () => void stop("SIGINT", 0));

  try {
    const modules = buildModules({ pool, logger, clock: () => new Date() });
    // No request is served before every module has migrated its schema.
    await modulesReady(modules);
    if (stopping) return;
    const app = createApp({
      routes: createRoutes(modules),
      ready: () => (stopping ? Promise.reject(new Error("shutting down")) : modulesReady(modules)),
      logger,
    });
    server = await listen(app, config.port, config.host);
    logger.info("listening", { host: config.host, port: portOf(server) });
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), { during: "startup" });
    await stop("startup failed", 1);
  }
}

main().catch((error: unknown) => {
  // Only what fails before the logger exists ends up here: the configuration, mostly.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exitCode = 1;
});
