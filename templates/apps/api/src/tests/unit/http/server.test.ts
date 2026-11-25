// Graceful shutdown: close() lets the requests in flight finish, and cuts them at the timeout.
import express from "express";
import { describe, expect, it } from "vitest";
import { close, listen, portOf } from "../../../http/server.ts";

/** An app whose only route answers when the test says so. */
async function slowServer() {
  let answer: () => void = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  let arrived: () => void = () => {};
  const inFlight = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const app = express();
  app.get("/slow", async (_request, response) => {
    arrived();
    await answered;
    response.json({ done: true });
  });
  const server = await listen(app, 0, "127.0.0.1");
  return { server, url: `http://127.0.0.1:${portOf(server)}/slow`, answer, inFlight };
}

describe("close()", () => {
  it("lets a request in flight finish, and refuses new connections", async () => {
    const { server, url, answer, inFlight } = await slowServer();
    const request = fetch(url).then((response) => response.json());
    await inFlight;
    const closed = close(server, 5_000);
    await expect(fetch(url)).rejects.toThrow();
    answer();
    await expect(request).resolves.toEqual({ done: true });
    await expect(closed).resolves.toBe(true);
  });

  it("cuts a request still in flight at the timeout", async () => {
    const { server, url, inFlight } = await slowServer();
    const request = fetch(url);
    await inFlight;
    await expect(close(server, 50)).resolves.toBe(false);
    await expect(request).rejects.toThrow();
  });
});
