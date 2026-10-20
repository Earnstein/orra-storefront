import { describe, expect, it } from "vitest";

import { authBaseUrl, parseServerEnv, paymentsConfigured, trustedAuthOrigins } from "@/lib/env";

const PRODUCTION_URL = "https://orra-storefront.vercel.app";

describe("authBaseUrl", () => {
  it("uses the deployment's own URL on previews, not BETTER_AUTH_URL", () => {
    expect(authBaseUrl({ VERCEL_ENV: "preview", VERCEL_URL: "orra-git-x.vercel.app", BETTER_AUTH_URL: PRODUCTION_URL }))
      .toBe("https://orra-git-x.vercel.app");
  });

  it("keeps BETTER_AUTH_URL on production and locally", () => {
    expect(authBaseUrl({ VERCEL_ENV: "production", VERCEL_URL: "orra-abc.vercel.app", BETTER_AUTH_URL: PRODUCTION_URL }))
      .toBe(PRODUCTION_URL);
    expect(authBaseUrl({ BETTER_AUTH_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("throws when the URL it needs is missing", () => {
    expect(() => authBaseUrl({ VERCEL_ENV: "preview" })).toThrow(/VERCEL_URL/);
    expect(() => authBaseUrl({})).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("trustedAuthOrigins", () => {
  it("trusts the deployment and branch URLs on previews", () => {
    expect(trustedAuthOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "a.vercel.app", VERCEL_BRANCH_URL: "b.vercel.app" }))
      .toEqual(["https://a.vercel.app", "https://b.vercel.app"]);
  });

  it("lists a preview origin once when the branch URL is missing or the same", () => {
    expect(trustedAuthOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "a.vercel.app" })).toEqual(["https://a.vercel.app"]);
    expect(trustedAuthOrigins({ VERCEL_ENV: "preview", VERCEL_URL: "a.vercel.app", VERCEL_BRANCH_URL: "a.vercel.app" }))
      .toEqual(["https://a.vercel.app"]);
  });

  it("adds nothing beyond the base URL elsewhere", () => {
    expect(trustedAuthOrigins({ VERCEL_ENV: "production", VERCEL_URL: "orra-abc.vercel.app", BETTER_AUTH_URL: PRODUCTION_URL }))
      .toEqual([]);
    expect(trustedAuthOrigins({ BETTER_AUTH_URL: "http://localhost:3000" })).toEqual([]);
  });
});

describe("parseServerEnv", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@host/db",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
  };

  it("requires BETTER_AUTH_URL outside previews", () => {
    expect(() => parseServerEnv({ ...base, BETTER_AUTH_URL: undefined })).toThrow(/BETTER_AUTH_URL/);
    expect(() => parseServerEnv({ ...base, BETTER_AUTH_URL: undefined, VERCEL_ENV: "production" })).toThrow(/BETTER_AUTH_URL/);
  });

  it("doesn't need BETTER_AUTH_URL on previews", () => {
    const env = parseServerEnv({ ...base, BETTER_AUTH_URL: undefined, VERCEL_ENV: "preview", VERCEL_URL: "a.vercel.app" });
    expect(env.VERCEL_ENV).toBe("preview");
    expect(env.BETTER_AUTH_URL).toBeUndefined();
  });

  it("treats empty optional values as unset", () => {
    const env = parseServerEnv({ ...base, RESEND_API_KEY: "", EMAIL_OUTBOX_DIR: "" });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.EMAIL_OUTBOX_DIR).toBeUndefined();
    expect(env.VERCEL_ENV).toBeUndefined();
  });

  it("leaves CRON_SECRET optional (the reset route answers 503 without it) and refuses a short one", () => {
    expect(parseServerEnv({ ...base, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
    const long = "x".repeat(32);
    expect(parseServerEnv({ ...base, CRON_SECRET: long }).CRON_SECRET).toBe(long);
    expect(() => parseServerEnv({ ...base, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
  });

  it("returns the email settings when set", () => {
    const env = parseServerEnv({ ...base, RESEND_API_KEY: "re_test", EMAIL_OUTBOX_DIR: "/tmp/outbox" });
    expect(env.RESEND_API_KEY).toBe("re_test");
    expect(env.EMAIL_OUTBOX_DIR).toBe("/tmp/outbox");
  });

  // Placeholders shaped like Stripe's test keys; not real credentials.
  const stripe = {
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  };

  it("leaves the Stripe keys optional, counting empty values as unset", () => {
    const env = parseServerEnv({ ...base, STRIPE_SECRET_KEY: "", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "", STRIPE_WEBHOOK_SECRET: "" });
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).toBeUndefined();
    expect(env.STRIPE_WEBHOOK_SECRET).toBeUndefined();
    expect(paymentsConfigured(env)).toBe(false);
  });

  it("returns the Stripe keys when set; payments need the secret and publishable keys", () => {
    const env = parseServerEnv({ ...base, ...stripe });
    expect(env.STRIPE_SECRET_KEY).toBe("sk_test_placeholder");
    expect(paymentsConfigured(env)).toBe(true);
    expect(paymentsConfigured(parseServerEnv({ ...base, STRIPE_SECRET_KEY: stripe.STRIPE_SECRET_KEY }))).toBe(false);
  });

  it("accepts only Stripe test-mode keys (the store promises no real money)", () => {
    expect(() => parseServerEnv({ ...base, ...stripe, STRIPE_SECRET_KEY: "sk_live_placeholder" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => parseServerEnv({ ...base, ...stripe, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_placeholder" })).toThrow(
      /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/,
    );
    // A restricted test key works too.
    expect(parseServerEnv({ ...base, ...stripe, STRIPE_SECRET_KEY: "rk_test_placeholder" }).STRIPE_SECRET_KEY).toBe("rk_test_placeholder");
  });

  it("never puts a rejected key's value in the error", () => {
    let message = "";
    try {
      parseServerEnv({ ...base, ...stripe, STRIPE_SECRET_KEY: "sk_live_do-not-echo" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/STRIPE_SECRET_KEY/);
    expect(message).not.toContain("do-not-echo");
  });
});
