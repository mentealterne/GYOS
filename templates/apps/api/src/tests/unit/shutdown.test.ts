// What stops the process: the handlers main.ts puts on `process`, here on an EventEmitter.
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import { onShutdown } from "../../shutdown.ts";
import { type LogEntry, recordingLogger } from "../support/test-app.ts";

let events: EventEmitter;
let logs: LogEntry[];
let stops: [string, number][];
let exits: number[];

beforeEach(() => {
  events = new EventEmitter();
  logs = [];
  stops = [];
  exits = [];
  onShutdown(events, {
    logger: recordingLogger(logs),
    stop: (reason, exitCode) => stops.push([reason, exitCode]),
    exit: (code) => exits.push(code),
  });
});

describe("a signal", () => {
  it.each(["SIGTERM", "SIGINT"])("%s starts a graceful stop, with exit code 0", (signal) => {
    events.emit(signal, signal);
    expect(stops).toEqual([[signal, 0]]);
    expect(exits).toEqual([]);
  });

  it.each([
    ["SIGTERM", "SIGTERM"],
    ["SIGTERM", "SIGINT"],
    ["SIGINT", "SIGTERM"],
  ])("after %s, %s ends the process at once", (first, second) => {
    events.emit(first, first);
    events.emit(second, second);
    expect(stops).toEqual([[first, 0]]);
    expect(exits).toEqual([1]);
  });
});

describe("an error nothing caught", () => {
  it("an uncaught exception is logged, then stops the process with exit code 1", () => {
    events.emit("uncaughtException", new Error("cannot read properties of undefined"));
    expect(logs).toContainEqual(
      expect.objectContaining({ level: "error", message: "cannot read properties of undefined", error: expect.any(Error) }),
    );
    expect(stops).toEqual([["uncaughtException", 1]]);
  });

  it("an unhandled rejection is logged, then stops the process with exit code 1, whatever was rejected", () => {
    events.emit("unhandledRejection", "connection reset");
    expect(logs).toContainEqual(expect.objectContaining({ level: "error", message: "connection reset" }));
    expect(stops).toEqual([["unhandledRejection", 1]]);
  });

  it("during a graceful stop, raises its exit code through the same stop", () => {
    events.emit("SIGTERM", "SIGTERM");
    events.emit("unhandledRejection", new Error("late"));
    expect(stops).toEqual([
      ["SIGTERM", 0],
      ["unhandledRejection", 1],
    ]);
    expect(exits).toEqual([]);
  });
});
