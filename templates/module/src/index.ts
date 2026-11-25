// The module's facade. A host calls createSampleModule once per process and keeps the result.
// Nothing here runs at import time: construction happens inside the factory body.
import { drizzle } from "drizzle-orm/node-postgres";
import { resolveSampleConfig, type SampleModuleConfig } from "./config/sample-config.ts";
import { migrateSample } from "./db/migrate.ts";
import { createSampleControllers, type SampleControllers } from "./module-controllers/index.ts";
import { createSampleRepositories } from "./repositories.ts";

export { SampleConfigError } from "./config/sample-config.ts";
export type { SampleModuleConfig } from "./config/sample-config.ts";
export { SampleItemError } from "./items/domain/errors.ts";

export interface SampleModule extends SampleControllers {
  /**
   * Migrates this module's schema. Every host awaits it before serving a request or running a
   * job. Calls share the run in flight; a failed run is forgotten, so the next call retries.
   */
  ready(): Promise<void>;
}

export function createSampleModule(input: SampleModuleConfig): SampleModule {
  const config = resolveSampleConfig(input);
  const logger = config.logger.child({ module: "sample" });
  const controllers = createSampleControllers({
    repositories: createSampleRepositories(drizzle({ client: config.db })),
    clock: config.clock,
    logger,
  });

  let migrated: Promise<void> | undefined;
  const ready = (): Promise<void> => {
    // The catch comes last, so that any rejection, the logger's included, is forgotten: a
    // memoised rejection would fail every later call without retrying.
    migrated ??= migrateSample(config.db, config.migrationsFolder, {
      lockTimeoutMs: config.migrationLockTimeoutMs,
    })
      .then(() => logger.info("ready"))
      .catch((error: unknown) => {
        migrated = undefined;
        throw error;
      });
    return migrated;
  };

  return { ...controllers, ready };
}
