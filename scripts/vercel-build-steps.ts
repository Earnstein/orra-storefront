/**
 * The npm scripts a Vercel build runs, by VERCEL_ENV:
 * - preview: its own Neon branch (Neon–Vercel integration) is migrated and seeded, so every
 *   preview has the catalogue. Guarded by previewGuardError() first.
 * - production: migrated only. Never seeded: that would reset live content and stock.
 * - anything else (unset, development): just the build.
 */
export function buildSteps(vercelEnv: string | undefined): string[] {
  if (vercelEnv === "preview") return ["db:migrate", "db:seed", "build"];
  if (vercelEnv === "production") return ["db:migrate", "build"];
  return ["build"];
}

/** Neon's pooled and direct hostnames differ only by "-pooler" on the endpoint label. */
function endpointHost(host: string): string {
  return host.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.");
}

function hostOf(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return undefined;
  try {
    return new URL(databaseUrl).hostname || undefined;
  } catch {
    return undefined;
  }
}

/**
 * A preview build migrates and seeds, so it must prove it is not pointed at production (a hand-set
 * Preview DATABASE_URL, or Neon skipping the preview branch). Returns why the build must stop, or
 * undefined when it is safe. PRODUCTION_DB_HOST is the production endpoint's hostname (not secret).
 */
export function previewGuardError(env: { databaseUrl: string | undefined; productionDbHost: string | undefined }): string | undefined {
  const host = hostOf(env.databaseUrl);
  if (!host) return "DATABASE_URL is missing or not a valid URL; a preview needs its own Neon branch.";
  if (!env.productionDbHost) return "PRODUCTION_DB_HOST is not set, so this preview can't prove it isn't using the production database.";
  if (endpointHost(host) === endpointHost(env.productionDbHost)) {
    return "This preview is pointed at the production database. Refusing to migrate or seed it; check the Neon integration's preview branch.";
  }
  return undefined;
}
