// Who a request acts for. The modules take the tenant id first in every use case
// (standards/module.md, M11); this is the one place the host decides where it comes from.
//
// THIS IS NOT AUTHENTICATION. Until the product authenticates its callers, the tenant is read from
// the x-tenant-id header, so the routes can be called at all in development and in tests. Any
// caller can send any tenant id, and read or write that tenant's data. The header is a development
// placeholder: it is on while TENANT_FROM_HEADER is (by default, outside production), and
// checkTenantSource stops a production host from starting with it.
//
// Once the product has authentication: derive the tenant from the authenticated session in
// tenantOf, never from anything the client sends; make checkTenantSource check what the
// authentication needs instead, or delete it and its call in main.ts; drop TENANT_FROM_HEADER
// from config.ts. GYOS's doctor warns while this file still reads the tenant from the header.
import type { Request } from "express";
import { type Config, ConfigError } from "../config.ts";
import { HttpError } from "./errors.ts";

/** The header the placeholder reads the tenant from. */
export const TENANT_HEADER = "x-tenant-id";

/** The longest tenant id the header may carry. */
export const TENANT_ID_MAX_LENGTH = 128;

/** Letters, digits, ".", "_" and "-": enough for slugs and UUIDs, and nothing to escape in a log. */
const TENANT_ID = /^[A-Za-z0-9._-]+$/;

/**
 * Throws a ConfigError when the host may not start with this tenant source: in production, where
 * a header must never decide whose data a request touches, and wherever TENANT_FROM_HEADER is off,
 * because the placeholder is then the host's only source and it is turned off. main.ts calls it
 * first, before it opens anything.
 */
export function checkTenantSource({ environment, tenantFromHeader }: Pick<Config, "environment" | "tenantFromHeader">): void {
  const replace = "replace the placeholder in src/http/tenant.ts with your authentication (standards/host.md, H6)";
  if (environment === "production") {
    throw new ConfigError([
      `NODE_ENV: production, and the tenant of a request still comes from the ${TENANT_HEADER} header. ` +
        "That header is a development placeholder, not authentication: any caller could act for any tenant. " +
        `Before running in production, ${replace}.`,
    ]);
  }
  if (!tenantFromHeader) {
    throw new ConfigError([
      `TENANT_FROM_HEADER: false, and the ${TENANT_HEADER} header is this host's only tenant source. ` +
        `Turn it on outside production, or ${replace}.`,
    ]);
  }
}

/**
 * The tenant of the request: for now, the x-tenant-id header, refused with 400 when it is missing
 * or isn't 1 to 128 letters, digits, ".", "_" or "-". The module validates the id again itself.
 */
export function tenantOf(request: Request): string {
  const tenantId = request.get(TENANT_HEADER);
  if (tenantId === undefined || tenantId === "") {
    throw new HttpError(400, "missing-tenant", `Send the tenant id in the ${TENANT_HEADER} header.`);
  }
  if (tenantId.length > TENANT_ID_MAX_LENGTH || !TENANT_ID.test(tenantId)) {
    throw new HttpError(
      400,
      "invalid-tenant",
      `The ${TENANT_HEADER} header holds 1 to ${TENANT_ID_MAX_LENGTH} letters, digits, ".", "_" or "-".`,
    );
  }
  return tenantId;
}
