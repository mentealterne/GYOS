import { describe, expect, it } from "vitest";
import { createFallbackLogger } from "../../logger.ts";

describe("fallback logger", () => {
  it("writes only warnings and errors, with the bindings of its children", () => {
    const lines: string[] = [];
    const logger = createFallbackLogger({}, (line) => lines.push(line)).child({ module: "sample" });

    logger.debug("quiet");
    logger.info("quiet");
    logger.warn("slow query", { ms: 900 });
    logger.error(new Error("boom"));

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { level: "warn", module: "sample", ms: 900, msg: "slow query" },
      expect.objectContaining({ level: "error", module: "sample", msg: "boom" }),
    ]);
  });
});
