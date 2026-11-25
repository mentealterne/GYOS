// Who a request acts for. The modules take the tenant id first in every use case
// (standards/module.md, M11); this is the one place the host decides where it comes from.
import type { Request } from "express";
import { HttpError } from "./errors.ts";

/** The header the routes read the tenant from, until the product has authentication. */
export const TENANT_HEADER = "x-tenant-id";

/**
 * The tenant of the request. Until the product has authentication, it is read from a header, so
 * the routes can be called at all. Once it has, derive the tenant from the authenticated session
 * here, and never trust a tenant id the client sends. The module validates the id itself.
 */
export function tenantOf(request: Request): string {
  const tenantId = request.get(TENANT_HEADER);
  if (tenantId === undefined) {
    throw new HttpError(400, "missing-tenant", `Send the tenant id in the ${TENANT_HEADER} header.`);
  }
  return tenantId;
}
