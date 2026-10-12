import type { BagRequest, BagResult } from "./service";

/** Sends one bag change to POST /api/bag. Network failures answer like a server failure. */
export async function postBag(request: BagRequest): Promise<BagResult> {
  try {
    const response = await fetch("/api/bag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      cache: "no-store",
    });
    return (await response.json()) as BagResult;
  } catch {
    return { ok: false, error: "failed", message: "Something went wrong. Try again." };
  }
}
