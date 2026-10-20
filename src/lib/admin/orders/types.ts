import type { OrderShipping } from "@/db/schema/orders";
import type { OrderItem, OrderStatus } from "@/lib/orders/queries";

// The admin's order shapes (client-safe). A demo admin gets them masked (mask.ts): initials, the
// email's domain, and only the city and state of the address.

export type MaskedShipping = { name: string; city: string; state: string };

/** A row in the admin's orders table. Dates are ISO strings (the table reads them as JSON too). */
export type AdminOrderRow = {
  number: string;
  createdAt: string;
  /** The name on the delivery address, when there is one. */
  name: string | null;
  email: string;
  status: OrderStatus;
  /** Cents. */
  total: number;
  itemCount: number;
};

type AdminOrderBase = {
  id: string;
  number: string;
  status: OrderStatus;
  createdAt: string;
  fulfilledAt: string | null;
  /** Set only once the order is cancelled. */
  cancelledAt: string | null;
  /** The cancel gave the money back (the order had been paid). */
  refunded: boolean;
  /** The owner's cancel is in progress (the refund is being made). */
  cancelling: boolean;
  /** A cancel started over 10 minutes ago and didn't finish: the refund may be made, so only a cancel can follow. */
  cancelCutOff: boolean;
  /** Placed signed in, rather than as a guest. */
  account: boolean;
  subtotal: number;
  currency: string;
  paymentSummary: string | null;
  items: OrderItem[];
};

export type AdminOrder =
  | (AdminOrderBase & { masked: false; email: string; shipping: OrderShipping | null })
  | (AdminOrderBase & { masked: true; email: string; shipping: MaskedShipping | null });

/** What the fulfil and cancel actions answer. */
export type OrderResult =
  | { ok: true; data: null }
  | { ok: false; error: "signed-out" | "forbidden" | "invalid" | "not-found" | "failed"; message: string };
