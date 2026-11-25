// The configuration contract: an input type where every tunable is optional, a resolved type
// where nothing is, and one function that layers the defaults and reports every problem at once.
// Nothing in this module reads process.env: the host reads the environment and passes values in.
import { isAbsolute } from "node:path";
import type { Pool } from "pg";
import { createFallbackLogger, type SampleLogger } from "../logger.ts";
import { SAMPLE_MIGRATIONS_FOLDER } from "../migrations.ts";

/** How long ready() waits for the migration lock while another run, of any module, holds it. */
export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 60_000;

export interface SampleModuleConfig {
  /** The host's pool. The module builds on it and never opens or ends one. */
  db: Pool;
  /** Where log lines go. Without one, only warnings and errors reach stderr. */
  logger?: SampleLogger;
  /** Now. Injected so that rules about time can be tested. Defaults to () => new Date(). */
  clock?: () => Date;
  /** Only for a host that bundles this module: where the shipped migrations folder is. */
  migrationsFolder?: string;
  /**
   * How long ready() waits for the migration lock, which every module of the workspace shares,
   * before it fails. Defaults to 60 000 ms.
   */
  migrationLockTimeoutMs?: number;
}

export interface ResolvedSampleConfig {
  db: Pool;
  logger: SampleLogger;
  clock: () => Date;
  migrationsFolder: string;
  migrationLockTimeoutMs: number;
}

export class SampleConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid sample module configuration:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    this.name = "SampleConfigError";
    this.problems = problems;
  }
}

const LOGGER_METHODS = ["error", "warn", "info", "debug", "child"] as const;

export function resolveSampleConfig(config: SampleModuleConfig): ResolvedSampleConfig {
  if (typeof config !== "object" || config === null) {
    throw new SampleConfigError(["config: expected an object"]);
  }
  const problems: string[] = [];
  const { db, logger, clock, migrationsFolder, migrationLockTimeoutMs } = config as Partial<SampleModuleConfig>;

  if (!hasMethods(db, ["connect", "query"])) {
    problems.push("db: expected a pg Pool");
  }
  if (logger !== undefined && !hasMethods(logger, LOGGER_METHODS)) {
    problems.push(`logger: expected an object with ${LOGGER_METHODS.join(", ")}`);
  }
  if (clock !== undefined && typeof clock !== "function") {
    problems.push("clock: expected a function that returns a Date");
  }
  if (migrationsFolder !== undefined) {
    if (typeof migrationsFolder !== "string" || !isAbsolute(migrationsFolder)) {
      problems.push("migrationsFolder: expected an absolute path");
    }
  }
  if (
    migrationLockTimeoutMs !== undefined &&
    !(Number.isInteger(migrationLockTimeoutMs) && migrationLockTimeoutMs > 0)
  ) {
    problems.push("migrationLockTimeoutMs: expected a positive whole number of milliseconds");
  }
  if (problems.length > 0) throw new SampleConfigError(problems);

  return {
    db: db as Pool,
    logger: logger ?? createFallbackLogger(),
    clock: clock ?? (() => new Date()),
    migrationsFolder: migrationsFolder ?? SAMPLE_MIGRATIONS_FOLDER,
    migrationLockTimeoutMs: migrationLockTimeoutMs ?? DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
  };
}

function hasMethods(value: unknown, methods: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return methods.every((method) => typeof record[method] === "function");
}
