/**
 * Which database a script is about to touch, judged by Neon endpoint. PRODUCTION_DB_HOST is the
 * production endpoint's hostname (not secret). Used by the Vercel preview guard and by db:seed.
 */

/**
 * One spelling per Neon endpoint, so a check can't be bypassed by formatting: trims and
 * lowercases, takes the hostname from a pasted URL, drops a port and terminal dots (URL.hostname
 * keeps "host."), and folds the pooled hostname ("ep-x-pooler.…") into the direct one ("ep-x.…").
 */
export function endpointHost(value: string): string {
  let host = value.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Not a URL after all; compare it as typed.
    }
  }
  return host
    .replace(/:\d+$/, "")
    .replace(/\.+$/, "")
    .replace(/^([^.]+)-pooler\./, "$1.");
}

/** The hostname of a connection string, or undefined when it's missing or not a URL. */
export function hostOf(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  try {
    return new URL(databaseUrl).hostname || undefined;
  } catch {
    return undefined;
  }
}

export type DatabaseTarget = "production" | "other" | "unknown";

/** "unknown" when PRODUCTION_DB_HOST is blank or DATABASE_URL is missing or not a URL. */
export function databaseTarget(env: { databaseUrl: string | undefined; productionDbHost: string | undefined }): DatabaseTarget {
  const productionHost = env.productionDbHost ? endpointHost(env.productionDbHost) : "";
  const host = hostOf(env.databaseUrl);
  if (!productionHost || !host) return "unknown";
  return endpointHost(host) === productionHost ? "production" : "other";
}

/**
 * Why `npm run db:seed` must stop, or undefined. Only the production database is refused, and only
 * without --production. When PRODUCTION_DB_HOST is unset (CI), the target is unknown and the seed runs.
 */
export function seedGuardError(env: {
  databaseUrl: string | undefined;
  productionDbHost: string | undefined;
  allowProduction: boolean;
}): string | undefined {
  if (env.allowProduction || databaseTarget(env) !== "production") return undefined;
  return "DATABASE_URL points at the production database (PRODUCTION_DB_HOST). Refusing to seed it; pass --production to do this on purpose.";
}
