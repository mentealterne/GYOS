import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createLogger, fromPino } from "../../logger.ts";

/** A pino destination that keeps every line, parsed. */
function capture(): { stream: Writable; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const line of chunk.toString("utf8").split("\n")) {
        if (line !== "") lines.push(JSON.parse(line) as Record<string, unknown>);
      }
      done();
    },
  });
  return { stream, lines };
}

describe("the pino adapter", () => {
  it("writes the message and the fields", () => {
    const { stream, lines } = capture();
    fromPino(pino({ level: "debug" }, stream)).info("item created", { itemId: "42" });
    expect(lines).toEqual([expect.objectContaining({ level: 30, msg: "item created", itemId: "42" })]);
  });

  it("puts an Error in err, with its stack and its cause", () => {
    const { stream, lines } = capture();
    const cause = new Error("connection refused");
    fromPino(pino(stream)).error(new Error("migration failed", { cause }), { module: "billing" });
    const [line] = lines;
    expect(line).toMatchObject({ level: 50, msg: "migration failed", module: "billing" });
    expect(line?.err).toMatchObject({ type: "Error", message: expect.stringContaining("migration failed") });
    expect(String((line?.err as { stack?: unknown }).stack)).toContain("migration failed");
  });

  it("keeps a child's bindings on every line", () => {
    const { stream, lines } = capture();
    const logger = fromPino(pino(stream)).child({ module: "billing" }).child({ tenantId: "acme" });
    logger.warn("slow query", { ms: 900 });
    expect(lines).toEqual([expect.objectContaining({ msg: "slow query", module: "billing", tenantId: "acme", ms: 900 })]);
  });

  it("drops lines below the level", () => {
    const { stream, lines } = capture();
    const logger = fromPino(pino({ level: "info" }, stream));
    logger.debug("noise");
    logger.info("signal");
    expect(lines.map((line) => line.msg)).toEqual(["signal"]);
  });
});

describe("createLogger", () => {
  it("builds the JSON logger, and flushes", async () => {
    const { stream, lines } = capture();
    const { logger, flush } = createLogger({ level: "info", pretty: false, destination: stream });
    logger.info("ready");
    await flush();
    expect(lines).toEqual([expect.objectContaining({ msg: "ready" })]);
  });
});
