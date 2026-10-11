import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSessionUser, recheckSession, sessionChangedElsewhere, sessionQueryKey } from "./browser-session";

const ada = { id: "u1", name: "Ada", email: "ada@example.test", emailVerified: false, image: null };

function answer(body: unknown, status = 200) {
  const fetch = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSessionUser", () => {
  it("returns the signed-in user's id, name and email only", async () => {
    const fetch = answer({ session: { token: "secret" }, user: ada });
    expect(await fetchSessionUser()).toEqual({ id: "u1", name: "Ada", email: "ada@example.test" });
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/get-session");
  });

  it("returns null when signed out", async () => {
    answer(null);
    expect(await fetchSessionUser()).toBeNull();
  });

  it("skips the cookie cache when asked", async () => {
    const fetch = answer(null);
    await fetchSessionUser({ uncached: true });
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/get-session?disableCookieCache=true");
  });

  it("throws on a failed answer instead of reading it as signed out", async () => {
    answer({ message: "boom" }, 500);
    await expect(fetchSessionUser()).rejects.toThrow("session: 500");
  });
});

describe("recheckSession", () => {
  it("updates every reader with the uncached answer", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionQueryKey, { id: "u1", name: "Ada", email: "ada@example.test" });
    answer(null);
    await recheckSession(queryClient);
    expect(queryClient.getQueryData(sessionQueryKey)).toBeNull();
  });

  it("doesn't overwrite a newer read started because another tab changed the session", async () => {
    const queryClient = new QueryClient();
    const renamed = { id: "u1", name: "Ada L.", email: "ada@example.test" };
    queryClient.setQueryData(sessionQueryKey, { id: "u1", name: "Ada", email: "ada@example.test" });
    let answerRecheck!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (answerRecheck = resolve))));

    const recheck = recheckSession(queryClient);
    // Another tab renames while the uncached check is under way; that read lands first.
    sessionChangedElsewhere(queryClient);
    queryClient.setQueryData(sessionQueryKey, renamed);
    answerRecheck(new Response(JSON.stringify({ user: { ...renamed, name: "Ada" } })));
    await recheck;

    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(renamed);
  });

  it("leaves the session alone when the check fails", async () => {
    const queryClient = new QueryClient();
    const user = { id: "u1", name: "Ada", email: "ada@example.test" };
    queryClient.setQueryData(sessionQueryKey, user);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await recheckSession(queryClient);
    expect(queryClient.getQueryData(sessionQueryKey)).toEqual(user);
  });
});
