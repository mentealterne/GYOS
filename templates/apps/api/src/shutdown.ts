// What stops the process, and how (standards/host.md, H8). main.ts wires it to `process`; a unit
// test wires it to an EventEmitter.
// - SIGTERM or SIGINT: one handler for both, so the first of either starts a graceful stop, and any
//   signal after it ends the process at once.
// - An error nothing caught, or a promise rejection nothing handled: it is logged, then the process
//   stops the same way, with exit code 1. Without these handlers Node would print the error to
//   stderr, outside the JSON logs, and exit without closing anything.
import type { Logger } from "./logger.ts";

/** The signals that stop the host gracefully. */
export const STOP_SIGNALS = ["SIGTERM", "SIGINT"] as const;

/** What the handlers listen on: `process`, in main.ts. */
export interface ProcessEvents {
  on(event: string, listener: (value: unknown) => void): unknown;
}

export interface ShutdownHandlers {
  logger: Logger;
  /** Starts the graceful stop. Called again, it only raises the exit code. */
  stop(reason: string, exitCode: 0 | 1): void;
  /** Ends the process now: a second signal. */
  exit(code: number): void;
}

export function onShutdown(events: ProcessEvents, { logger, stop, exit }: ShutdownHandlers): void {
  let signals = 0;
  const onSignal = (signal: unknown): void => {
    signals += 1;
    if (signals === 1) {
      stop(String(signal), 0);
      return;
    }
    logger.warn("a second signal: exiting now, without waiting", { signal: String(signal) });
    exit(1);
  };
  for (const signal of STOP_SIGNALS) events.on(signal, onSignal);

  events.on("uncaughtException", (error) => {
    logger.error(asError(error), { during: "an exception nothing caught" });
    stop("uncaughtException", 1);
  });
  events.on("unhandledRejection", (reason) => {
    logger.error(asError(reason), { during: "a promise rejection nothing handled" });
    stop("unhandledRejection", 1);
  });
}

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));
