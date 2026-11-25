// The product's logger: pino, built once by main.ts, and adapted to the logger port that every
// module declares (<Name>Logger in its src/logger.ts). The modules never import pino: they get
// this adapter through their config, so swapping the logger is a change to this file alone.
//
// OpenTelemetry: @opentelemetry/instrumentation-pino (0.71, for pino >=5.14 <11, checked
// 2026-11-25) patches pino as it loads. It adds trace_id, span_id and trace_flags to every line
// written inside a span, and sends the records to the OpenTelemetry Logs SDK when one is
// registered. Nothing below changes for that, because the adapter calls pino's own methods. What
// changes is the start: the OpenTelemetry Node SDK, with PinoInstrumentation, starts before
// anything imports pino, in a file loaded with `node --import`, and in an ESM app OpenTelemetry's
// module hook must be registered too. Not verified in GYOS: follow the OpenTelemetry JS docs.
import pino, { type DestinationStream, type Logger as Pino } from "pino";
import type { LogLevel } from "./config.ts";

export type LogFields = Record<string, unknown>;

/** The port each module declares. One adapter satisfies all of them. */
export interface Logger {
  error(message: string | Error, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level: LogLevel;
  /**
   * Readable lines through pino-pretty, a dev dependency, instead of JSON: development only. A
   * production install has no pino-pretty, so it must stay off there.
   */
  pretty: boolean;
  /** Where the JSON lines go. Defaults to stdout; tests pass their own stream. */
  destination?: DestinationStream;
}

export interface AppLogger {
  logger: Logger;
  /** Writes out whatever is still buffered. main.ts calls it last, at shutdown. */
  flush(): Promise<void>;
}

export function createLogger({ level, pretty, destination }: LoggerOptions): AppLogger {
  // Without a destination, pino writes to stdout asynchronously, and flushes what is left when
  // the process exits.
  const instance = pretty ? pino({ level, transport: { target: "pino-pretty" } }) : pino({ level }, destination);
  return {
    logger: fromPino(instance),
    flush: () =>
      new Promise((resolve, reject) => {
        instance.flush((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** The adapter: the module's port on top of a pino logger. An Error goes in pino's `err` field. */
export function fromPino(instance: Pino): Logger {
  return {
    error: (message, fields) => {
      if (message instanceof Error) instance.error({ ...fields, err: message }, message.message || message.name);
      else instance.error({ ...fields }, message);
    },
    warn: (message, fields) => instance.warn({ ...fields }, message),
    info: (message, fields) => instance.info({ ...fields }, message),
    debug: (message, fields) => instance.debug({ ...fields }, message),
    child: (bindings) => fromPino(instance.child(bindings)),
  };
}
