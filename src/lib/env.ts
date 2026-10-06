import { z } from "zod";

/** An optional value where an empty string (as `.env.example` leaves them) counts as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const serverSchema = z
  .object({
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    // Required except on Vercel previews, which derive the auth URL from VERCEL_URL.
    BETTER_AUTH_URL: optional(z.url()),
    // Set by Vercel: https://vercel.com/docs/environment-variables/system-environment-variables
    VERCEL_ENV: optional(z.enum(["production", "preview", "development"])),
    VERCEL_URL: optional(z.string()),
    VERCEL_BRANCH_URL: optional(z.string()),
    // Without a key, emails are logged instead of sent.
    RESEND_API_KEY: optional(z.string()),
    // Local runs and CI only: also write each email to a file here, so e2e tests can read links.
    EMAIL_OUTBOX_DIR: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    if (env.VERCEL_ENV !== "preview" && !env.BETTER_AUTH_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL is required outside Vercel previews",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  return serverSchema.parse(raw);
}

/** Server-only env. Throws on first access if anything is missing or invalid. */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

type AuthUrlEnv = {
  VERCEL_ENV?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  BETTER_AUTH_URL?: string;
};

/**
 * Better Auth's base URL. Previews use their own deployment URL: their BETTER_AUTH_URL points at
 * production, where sign-in on a preview would fail the origin check. Production and local
 * development keep BETTER_AUTH_URL.
 */
export function authBaseUrl(env: AuthUrlEnv): string {
  if (env.VERCEL_ENV === "preview") {
    if (!env.VERCEL_URL) throw new Error("VERCEL_URL is required on Vercel previews");
    return `https://${env.VERCEL_URL}`;
  }
  if (!env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL is required outside Vercel previews");
  return env.BETTER_AUTH_URL;
}

/**
 * Origins Better Auth accepts besides its base URL. A preview is reached at its deployment URL
 * and at its branch URL, so both are trusted there; elsewhere the base URL is enough.
 */
export function trustedAuthOrigins(env: AuthUrlEnv): string[] {
  if (env.VERCEL_ENV !== "preview") return [];
  const hosts = [env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter((host): host is string => Boolean(host));
  return [...new Set(hosts)].map((host) => `https://${host}`);
}
