import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Resend } from "resend";

import { serverEnv } from "@/lib/env";
import { site } from "@/lib/site";

export type Email = { to: string; subject: string; html: string; text: string };

/** Resend's test sender: until M7 adds a domain, it only delivers to the Resend account's owner. */
export const EMAIL_FROM = `${site.name} <onboarding@resend.dev>`;

/**
 * Sends an email, never throwing: failures are logged (without the body) so a caller such as a
 * password reset answers the same whether or not the email went out.
 * - `EMAIL_OUTBOX_DIR` set (local runs and CI; ignored on Vercel): writes it there as JSON instead.
 * - `RESEND_API_KEY` set: sends through Resend.
 * - Neither: logs the recipient and, outside production, the first link, so local resets work.
 */
export async function sendEmail(email: Email): Promise<void> {
  try {
    const env = serverEnv();
    const production = env.VERCEL_ENV === "production";
    const message = { from: EMAIL_FROM, ...email };

    if (env.EMAIL_OUTBOX_DIR && !env.VERCEL_ENV) {
      await mkdir(env.EMAIL_OUTBOX_DIR, { recursive: true });
      const file = path.join(env.EMAIL_OUTBOX_DIR, `${Date.now()}-${fileSafe(email.to)}.json`);
      await writeFile(file, JSON.stringify(message, null, 2));
      console.info(`[email] to=${email.to} subject=${email.subject} outbox=${file}`);
      return;
    }

    if (env.RESEND_API_KEY) {
      const { error } = await new Resend(env.RESEND_API_KEY).emails.send(message);
      if (error) throw new Error(`${error.name}: ${error.message}`);
      return;
    }

    console.info(`[email] to=${email.to} subject=${email.subject} (not sent: no RESEND_API_KEY)`);
    const link = production ? undefined : email.text.match(/https?:\/\/\S+/)?.[0];
    if (link) console.info(`[email] link: ${link}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[email] failed to send to=${email.to} subject=${email.subject}: ${reason}`);
  }
}

function fileSafe(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
}
