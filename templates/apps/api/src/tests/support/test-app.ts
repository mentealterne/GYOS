// Starts the app on an ephemeral port, the way main.ts does, with the routes and the readiness a
// test gives it, and a logger that records what it is told.
import { Router } from "express";
import { createApp } from "../../http/app.ts";
import { close, listen, portOf } from "../../http/server.ts";
import type { LogFields, Logger } from "../../logger.ts";

export interface LogEntry {
  level: "error" | "warn" | "info" | "debug";
  message: string;
  error?: Error;
  fields: LogFields;
}

/** A logger that keeps every entry, bindings included, in `entries`. */
export function recordingLogger(entries: LogEntry[] = [], bindings: LogFields = {}): Logger {
  const record = (level: LogEntry["level"], message: string | Error, fields?: LogFields): void => {
    const error = message instanceof Error ? message : undefined;
    entries.push({ level, message: error?.message ?? String(message), error, fields: { ...bindings, ...fields } });
  };
  return {
    error: (message, fields) => record("error", message, fields),
    warn: (message, fields) => record("warn", message, fields),
    info: (message, fields) => record("info", message, fields),
    debug: (message, fields) => record("debug", message, fields),
    child: (more) => recordingLogger(entries, { ...bindings, ...more }),
  };
}

export interface TestResponse {
  status: number;
  headers: Headers;
  /** The parsed JSON body, or undefined when the body is empty or not JSON. */
  body: unknown;
  text: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  /** Sent as JSON. */
  json?: unknown;
  /** Sent as it is, with a JSON content type: for bodies that are not valid JSON. */
  raw?: string;
}

export interface TestApp {
  url: string;
  logs: LogEntry[];
  request(method: string, path: string, options?: RequestOptions): Promise<TestResponse>;
  close(): Promise<void>;
}

export async function startApp({
  routes = Router(),
  ready = async () => {},
}: { routes?: Router; ready?: () => Promise<void> } = {}): Promise<TestApp> {
  const logs: LogEntry[] = [];
  const server = await listen(createApp({ routes, ready, logger: recordingLogger(logs) }), 0, "127.0.0.1");
  const url = `http://127.0.0.1:${portOf(server)}`;
  return {
    url,
    logs,
    async request(method, path, { headers = {}, json, raw } = {}) {
      const body = raw ?? (json === undefined ? undefined : JSON.stringify(json));
      const response = await fetch(`${url}${path}`, {
        method,
        headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
        body,
      });
      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = text === "" ? undefined : JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return { status: response.status, headers: response.headers, body: parsed, text };
    },
    async close() {
      await close(server, 1_000);
    },
  };
}
