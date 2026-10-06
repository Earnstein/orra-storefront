/**
 * Which database a script is about to touch, judged by Neon endpoint. PRODUCTION_DB_HOST is the
 * production endpoint's hostname (not secret). Used by the Vercel preview guard, db:seed and
 * db:migrate.
 */

/**
 * One spelling per Neon endpoint, so a check can't be bypassed by formatting: trims and
 * lowercases, takes the hostname from a pasted URL, drops a port and terminal dots (URL.hostname
 * keeps "host."), and folds the pooled hostname ("ep-x-pooler.…") into the direct one ("ep-x.…").
 * URL parse failures fall back to normalizing the supplied text; they do not throw.
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

/** The hostname of a connection string, or undefined when it's missing, invalid, or has no hostname. */
export function hostOf(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  try {
    return new URL(databaseUrl).hostname || undefined;
  } catch {
    return undefined;
  }
}

export type DatabaseTarget = "production" | "other" | "unknown";

/**
 * Compares normalized endpoint hosts, returning "production" for a match and "other" otherwise.
 * Returns "unknown" if the normalized production host is empty or DATABASE_URL has no parseable hostname.
 */
export function databaseTarget(env: { databaseUrl: string | undefined; productionDbHost: string | undefined }): DatabaseTarget {
  const productionHost = env.productionDbHost ? endpointHost(env.productionDbHost) : "";
  const host = hostOf(env.databaseUrl);
  if (!productionHost || !host) return "unknown";
  return endpointHost(host) === productionHost ? "production" : "other";
}

/** For logs and `--check`: which database DATABASE_URL is, without printing it. */
export function describeTarget(env: { databaseUrl: string | undefined; productionDbHost: string | undefined }): string {
  const target = databaseTarget(env);
  if (target === "production") return "production";
  if (target === "other") return "not production";
  return env.productionDbHost?.trim() ? "unknown (DATABASE_URL is missing or not a URL)" : "unknown (PRODUCTION_DB_HOST is not set)";
}

/**
 * How a command treats the production database:
 * - refuse (the default): stop if DATABASE_URL is production;
 * - require (`--production`): stop unless DATABASE_URL is confirmed as production, so a release step
 *   can't quietly run against another database;
 * - allow (a Vercel production build): never stop.
 */
export type ProductionMode = "refuse" | "require" | "allow";

/**
 * Why `npm run db:seed` or `db:migrate` must stop, or undefined. When PRODUCTION_DB_HOST is unset
 * (CI), the target is unknown: the default lets it through, `--production` can't confirm it.
 */
export function productionGuardError(env: {
  databaseUrl: string | undefined;
  productionDbHost: string | undefined;
  production: ProductionMode;
  action: "seed" | "migrate";
}): string | undefined {
  const target = databaseTarget(env);
  if (env.production === "allow") return undefined;
  if (env.production === "require") {
    if (target === "production") return undefined;
    return target === "other"
      ? `--production was passed, but DATABASE_URL isn't the production database. Nothing to ${env.action}; check which env file is loaded.`
      : `--production was passed, but DATABASE_URL can't be confirmed as the production database (${describeTarget(env)}).`;
  }
  if (target === "production") {
    return `DATABASE_URL points at the production database (PRODUCTION_DB_HOST). Refusing to ${env.action} it; pass --production to do this on purpose.`;
  }
  return undefined;
}

/**
 * Why `npm run db:clear-accounts` must stop, or undefined. Stricter than productionGuardError:
 * deleting every account is only allowed on a database confirmed as not production, and
 * nothing overrides it.
 */
export function clearAccountsGuardError(env: { databaseUrl: string | undefined; productionDbHost: string | undefined }): string | undefined {
  const target = databaseTarget(env);
  if (target === "other") return undefined;
  if (target === "production") return "DATABASE_URL points at the production database (PRODUCTION_DB_HOST). Refusing to clear its accounts.";
  return `Refusing to clear accounts: can't confirm DATABASE_URL isn't production (${describeTarget(env)}).`;
}
