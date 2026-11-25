// The host's configuration, and the one place in the host that reads process.env. Every variable
// is validated at once, so a bad deploy fails at boot with one message that lists every problem,
// not one problem per restart. Values are never echoed: DATABASE_URL holds a password.
// The modules read nothing from the environment: main.ts passes them what they need.
import { z } from "zod";

export const ENVIRONMENTS = ["development", "test", "production"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  /** NODE_ENV. "development" turns on readable logs. Defaults to "production". */
  environment: Environment;
  /** HOST: the interface the server listens on. Defaults to 0.0.0.0, every interface. */
  host: string;
  /** PORT. 0 lets the system choose one. Defaults to 3000. */
  port: number;
  /** DATABASE_URL: a postgres:// URL. Required. */
  databaseUrl: string;
  /** DATABASE_POOL_MAX: the most connections the pool opens. Defaults to 10. */
  databasePoolMax: number;
  /** LOG_LEVEL. Defaults to "info". */
  logLevel: LogLevel;
  /** SHUTDOWN_TIMEOUT_MS: how long requests in flight get to finish at shutdown. Defaults to 10 000. */
  shutdownTimeoutMs: number;
  /**
   * SHUTDOWN_DELAY_MS: how long the server keeps serving after SIGTERM or SIGINT, with /ready at
   * 503, before it stops accepting connections, so load balancers stop routing to it first.
   * Defaults to 0.
   */
  shutdownDelayMs: number;
  /**
   * KEEP_ALIVE_TIMEOUT_MS: how long an idle keep-alive connection stays open. Above the idle
   * timeout of the load balancer in front (60 s on an AWS Application Load Balancer). Defaults to
   * 65 000.
   */
  keepAliveTimeoutMs: number;
  /** HEADERS_TIMEOUT_MS: how long a request's headers may take. Above KEEP_ALIVE_TIMEOUT_MS. Defaults to 66 000. */
  headersTimeoutMs: number;
  /**
   * TENANT_FROM_HEADER: whether the tenant may come from the x-tenant-id header, the development
   * placeholder in http/tenant.ts. Not authentication. Defaults to true, except in production.
   */
  tenantFromHeader: boolean;
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const required = (expected: string) => (issue: { input?: unknown }) =>
  issue.input === undefined ? "is not set" : `expected ${expected}`;

const wholeNumber = (expected: string, min: number, max: number) =>
  z.coerce
    .number({ error: required(expected) })
    .int({ error: `expected ${expected}` })
    .min(min, { error: `expected ${expected}` })
    .max(max, { error: `expected ${expected}` });

const environmentSchema = z.object({
  NODE_ENV: z.enum(ENVIRONMENTS, { error: `expected one of ${ENVIRONMENTS.join(", ")}` }).default("production"),
  HOST: z.string().default("0.0.0.0"),
  PORT: wholeNumber("a port, 0 to 65535", 0, 65_535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: required("a postgres:// URL") }),
  DATABASE_POOL_MAX: wholeNumber("a whole number above 0", 1, 10_000).default(10),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: `expected one of ${LOG_LEVELS.join(", ")}` }).default("info"),
  SHUTDOWN_TIMEOUT_MS: wholeNumber("a whole number of milliseconds above 0", 1, 3_600_000).default(10_000),
  SHUTDOWN_DELAY_MS: wholeNumber("a whole number of milliseconds, 0 or more", 0, 3_600_000).default(0),
  // Node's request timeout, 300 s by default, bounds the headers timeout.
  KEEP_ALIVE_TIMEOUT_MS: wholeNumber("a whole number of milliseconds, 1 to 299999", 1, 299_999).default(65_000),
  HEADERS_TIMEOUT_MS: wholeNumber("a whole number of milliseconds, 2 to 300000", 2, 300_000).default(66_000),
  TENANT_FROM_HEADER: z.enum(["true", "false"], { error: "expected true or false" }).optional(),
});

/**
 * Reads the configuration from `env` (process.env by default). A variable set to an empty
 * string counts as not set, as it does in most .env files.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const set = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
  const result = environmentSchema.safeParse(set);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  const values = result.data;
  // Each value is valid on its own; this one depends on another. A headers timeout at or below
  // the keep-alive timeout can close a keep-alive connection early (nodejs/node#27363).
  if (values.HEADERS_TIMEOUT_MS <= values.KEEP_ALIVE_TIMEOUT_MS) {
    throw new ConfigError(["HEADERS_TIMEOUT_MS: expected more than KEEP_ALIVE_TIMEOUT_MS"]);
  }
  return {
    environment: values.NODE_ENV,
    host: values.HOST,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    databasePoolMax: values.DATABASE_POOL_MAX,
    logLevel: values.LOG_LEVEL,
    shutdownTimeoutMs: values.SHUTDOWN_TIMEOUT_MS,
    shutdownDelayMs: values.SHUTDOWN_DELAY_MS,
    keepAliveTimeoutMs: values.KEEP_ALIVE_TIMEOUT_MS,
    headersTimeoutMs: values.HEADERS_TIMEOUT_MS,
    tenantFromHeader:
      values.TENANT_FROM_HEADER === undefined ? values.NODE_ENV !== "production" : values.TENANT_FROM_HEADER === "true",
  };
}
