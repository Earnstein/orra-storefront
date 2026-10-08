import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect } from "@playwright/test";

/**
 * Where the local e2e server writes emails instead of sending them (EMAIL_OUTBOX_DIR, set on the
 * web server in playwright.config.ts). Not available against a deployed URL.
 */
export const OUTBOX_DIR = path.join(tmpdir(), "orra-e2e-outbox");

/** The reset link in the newest email to `email`, waiting up to 10 s for it to arrive. */
export async function readResetLink(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const files = (await readdir(OUTBOX_DIR).catch(() => [])).filter((file) => file.endsWith(`-${email}.json`)).sort();
        const newest = files.at(-1);
        if (!newest) return undefined;
        const { text } = JSON.parse(await readFile(path.join(OUTBOX_DIR, newest), "utf8")) as { text: string };
        link = text.match(/https?:\/\/\S+\/reset-password\/\S+/)?.[0];
        return link;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  return link!;
}
