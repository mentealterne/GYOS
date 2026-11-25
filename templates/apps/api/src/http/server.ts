// Starting and stopping the HTTP server. main.ts uses both; the tests start the app the same way.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

/** Listens on `host:port`; resolves once listening, rejects when it can't (a port in use). */
export function listen(app: Express, port: number, host: string): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

/** The port the server listens on: the one asked for, or the one the system chose for port 0. */
export function portOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

/**
 * Stops accepting connections and lets the requests in flight finish. Idle keep-alive
 * connections are closed at once; after `timeoutMs`, so is every connection still open.
 * Resolves `true` when everything finished in time, `false` when connections had to be cut.
 */
export function close(server: Server, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let cut = false;
    const deadline = setTimeout(() => {
      cut = true;
      server.closeAllConnections();
    }, timeoutMs);
    server.close((error) => {
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(!cut);
    });
    server.closeIdleConnections();
  });
}
