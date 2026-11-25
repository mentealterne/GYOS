// Every module of the product, built once per process on the host's pool, logger and clock.
// main.ts calls buildModules once and keeps the result (standards/module.md, M1).
//
// This is also where junctions are wired: a rule that spans two modules belongs to neither
// (standards/module.md, Junctions). The module that needs something declares a port in its own
// language, and this file implements it by calling the other module, so neither module imports
// the other. Build the module that provides first, then pass the port to the one that needs it:
//
//   const billing = createBillingModule({ db: pool, logger, clock });
//   const scheduling = createSchedulingModule({
//     db: pool,
//     logger,
//     clock,
//     // Junction "a completed session is invoiced" (docs/context-map.md, Junctions).
//     sessionInvoicer: {
//       invoice: (tenantId, session) => billing.invoices.create(tenantId, { sessionId: session.id }),
//     },
//   });
//
// scripts/new-module.ts --host adds a module here, one line right above each gyos:modules:*
// marker. Keep the markers; reorder the build lines by hand when a junction needs it.
import type { Pool } from "pg";
import type { Logger } from "./logger.ts";
// gyos:modules:imports

export interface ModuleDeps {
  /** The one pool of the process. The modules build on it and never end it. */
  pool: Pool;
  logger: Logger;
  /** Now. Every module gets the same clock. */
  clock: () => Date;
}

export interface Modules {
  // gyos:modules:type
}

export function buildModules({ pool, logger, clock }: ModuleDeps): Modules {
  // gyos:modules:build
  return {
    // gyos:modules:return
  };
}

/**
 * Resolves once every module is ready: its schema is migrated (standards/module.md, M8). The
 * modules migrate one at a time under a shared lock, so awaiting them all at once is safe.
 */
export async function modulesReady(modules: Modules): Promise<void> {
  const all: Record<keyof Modules, { ready(): Promise<void> }> = modules;
  await Promise.all(Object.values(all).map((module) => module.ready()));
}
