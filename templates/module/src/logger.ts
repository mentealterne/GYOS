// The logger port: the subset of a logger this module uses. The host injects the real one
// (pino, pino with OpenTelemetry, its own). The module never depends on a logging library.

export type LogFields = Record<string, unknown>;

export interface SampleLogger {
  error(message: string | Error, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  child(bindings: LogFields): SampleLogger;
}

/**
 * Used when the host injects no logger. A library documents its logging and doesn't configure
 * output, so only warnings and errors are written, one JSON line each, to stderr.
 */
export function createFallbackLogger(
  bindings: LogFields = {},
  write: (line: string) => void = (line) => process.stderr.write(line),
): SampleLogger {
  const emit = (level: "warn" | "error", message: string | Error, fields?: LogFields): void => {
    const text = message instanceof Error ? message.message : message;
    const error = message instanceof Error ? { stack: message.stack } : {};
    write(`${JSON.stringify({ level, ...bindings, ...fields, ...error, msg: text })}\n`);
  };
  return {
    error: (message, fields) => emit("error", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    info: () => {},
    debug: () => {},
    child: (more) => createFallbackLogger({ ...bindings, ...more }, write),
  };
}
