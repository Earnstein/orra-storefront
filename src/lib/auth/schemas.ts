import { z } from "zod";

import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export const nameSchema = z.string().trim().min(1, "Enter your name.").max(80, "Use at most 80 characters.");

/** Sign-in only needs a password to be there: length rules apply when one is set, not when it's used. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  rememberMe: z.boolean(),
});

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
