import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
});

/** Server-only env. Throws on first access if anything is missing or invalid. */
export function serverEnv() {
  return serverSchema.parse(process.env);
}

// NEXT_PUBLIC_* vars must be referenced statically to be inlined in the client bundle.
export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
});
