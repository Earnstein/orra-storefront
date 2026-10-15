import { z } from "zod";

import { readCartRef, writeBagCookies } from "@/lib/bag/request";
import { confirmCheckoutWith, type ConfirmAnswer } from "@/lib/checkout/confirm";
import { fulfilDeps } from "@/lib/orders/deps";
import { PaymentsUnavailableError } from "@/lib/payments/types";

const PRIVATE = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ checkout: z.uuid() });

/**
 * The success page's confirmation (`{ checkout }` → `ConfirmAnswer`). A route handler, not a
 * server action, because it sets the bag's count cookie once the bought lines leave the bag (a
 * cookie set in a server action makes Next refetch the page). Same origin only.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ status: "received" } satisfies ConfirmAnswer, { status: 403, headers: PRIVATE });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ status: "received" } satisfies ConfirmAnswer, { status: 400, headers: PRIVATE });

  try {
    const { answer, count } = await confirmCheckoutWith(fulfilDeps(), { cart: await readCartRef(), checkoutId: parsed.data.checkout });
    if (count !== null) await writeBagCookies({ count });
    return Response.json(answer, { headers: PRIVATE });
  } catch (error) {
    if (!(error instanceof PaymentsUnavailableError)) console.error("checkout: confirm failed", error instanceof Error ? error.message : error);
    // The page keeps checking, then says the email will follow.
    return Response.json({ status: "pending" } satisfies ConfirmAnswer, { status: 500, headers: PRIVATE });
  }
}
