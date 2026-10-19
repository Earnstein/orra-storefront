import type { OrderShipping } from "@/db/schema/orders";
import type { AdminOrder, AdminOrderRow, MaskedShipping } from "./types";

// The demo admin is public, so it never sees a customer's name, email or street: names become
// initials ("A. L."), emails keep only their domain ("•••@example.test"), addresses only the city
// and state. Applied on the server, before anything is sent.

const first = (word: string) => Array.from(word)[0]?.toLocaleUpperCase("en-US") ?? "";

/** "Ada Lovelace" → "A. L." (first and last names; one name → "A."). */
export function maskName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  const kept = words.length === 1 ? words : [words[0], words.at(-1)!];
  return kept.map((word) => `${first(word)}.`).join(" ");
}

/** "ada@example.test" → "•••@example.test". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "•••" : `•••${email.slice(at)}`;
}

export function maskShipping(shipping: OrderShipping | MaskedShipping): MaskedShipping {
  return { name: maskName(shipping.name), city: shipping.city, state: shipping.state };
}

export function maskOrder(order: AdminOrder): AdminOrder {
  if (order.masked) return order;
  return { ...order, masked: true, email: maskEmail(order.email), shipping: order.shipping && maskShipping(order.shipping) };
}

export function maskOrderRow(row: AdminOrderRow): AdminOrderRow {
  return { ...row, name: row.name === null ? null : maskName(row.name), email: maskEmail(row.email) };
}
