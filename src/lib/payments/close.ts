import type { PaymentProvider } from "./types";

/**
 * Closes the payment of a hold that was just released (replaced, emptied, merged on sign-in), but
 * only if nobody has paid it: a shopper can authorise a payment in a hold's last seconds, before
 * fulfilment records it. Authorised and paid payments are left for fulfilment's lapsed-hold path
 * (take the stock again, or give the money back). When the payment can't be checked, it's left too:
 * an unpaid session expires with its hold. Never throws.
 */
export async function closeReleasedPayment(provider: PaymentProvider, reference: string): Promise<"closed" | "left"> {
  try {
    const { status } = await provider.verify(reference);
    if (status === "authorised" || status === "paid") {
      console.warn(`checkout: a released hold's payment is ${status}; leaving it for fulfilment`, reference);
      return "left";
    }
    if (status === "expired" || status === "failed") return "closed";
    await provider.undo(reference);
    return "closed";
  } catch (error) {
    console.error("checkout: couldn't close a released payment", reference, error instanceof Error ? error.message : error);
    return "left";
  }
}
