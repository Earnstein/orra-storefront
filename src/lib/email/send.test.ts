import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendSend = vi.hoisted(() => vi.fn());
const resendConstructed = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
    constructor(key: string) {
      resendConstructed(key);
    }
  },
}));

import { EMAIL_FROM, sendEmail, type Email } from "@/lib/email/send";

const email: Email = {
  to: "ada@example.test",
  subject: "Reset your Orra password",
  html: `<p>secret body <a href="https://x.test/reset?token=abc">Reset</a></p>`,
  text: "secret body https://x.test/reset?token=abc",
};

let outbox: string;

beforeEach(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "orra-outbox-"));
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@host/db");
  vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_OUTBOX_DIR", "");
  resendSend.mockReset().mockResolvedValue({ data: { id: "em_1" }, error: null });
  resendConstructed.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(outbox, { recursive: true, force: true });
});

describe("sendEmail", () => {
  it("writes to the outbox instead of sending when EMAIL_OUTBOX_DIR is set", async () => {
    vi.stubEnv("EMAIL_OUTBOX_DIR", outbox);
    await sendEmail(email);

    const files = await readdir(outbox);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d+-ada@example\.test\.json$/);
    expect(JSON.parse(await readFile(path.join(outbox, files[0]), "utf8"))).toEqual({ from: EMAIL_FROM, ...email });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it.each(["production", "preview"])("never writes to the outbox on Vercel (%s)", async (vercelEnv) => {
    vi.stubEnv("EMAIL_OUTBOX_DIR", outbox);
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    await sendEmail(email);
    expect(await readdir(outbox)).toEqual([]);
  });

  it("sends through Resend from the test sender when a key is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await sendEmail(email);
    expect(resendConstructed).toHaveBeenCalledWith("re_test");
    expect(resendSend).toHaveBeenCalledWith({ from: EMAIL_FROM, ...email });
    expect(EMAIL_FROM).toBe("Orra <onboarding@resend.dev>");
  });

  it("logs a failed send once without the body, and doesn't throw", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    resendSend.mockRejectedValue(new Error("network down"));
    await expect(sendEmail(email)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(console.error).mock.calls[0].join(" ");
    expect(logged).toContain("network down");
    expect(logged).not.toContain("secret body");
    expect(logged).not.toContain("token=abc");
  });

  it("treats an error answer from Resend as a failure", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    resendSend.mockResolvedValue({ data: null, error: { name: "validation_error", message: "domain not verified" } });
    await sendEmail(email);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0].join(" ")).toContain("domain not verified");
  });

  it("without a key, logs the recipient and, outside production, the link", async () => {
    await sendEmail(email);
    const logged = vi.mocked(console.info).mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("[email] to=ada@example.test subject=Reset your Orra password");
    expect(logged).toContain("https://x.test/reset?token=abc");
    expect(logged).not.toContain("secret body");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("without a key on production, doesn't log the link", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    await sendEmail(email);
    const logged = vi.mocked(console.info).mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("[email] to=ada@example.test");
    expect(logged).not.toContain("token=abc");
  });

  it("logs a bad env as a failure instead of throwing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(sendEmail(email)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
