import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OrderPage } from "@/components/orders/order-page";
import { OrderSkeleton } from "@/components/orders/order-skeleton";
import { Container } from "@/components/primitives";
import { db } from "@/db";
import { parseOrderNumber } from "@/lib/orders/number";
import { getOrderForGuestKey } from "@/lib/orders/queries";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false },
  // The key is in the address: never send it on to another site.
  referrer: "no-referrer",
};

// A guest's order, from the link in their confirmation email (`/orders/ORR-10001?key=…`), shown
// only when the key matches; src/proxy.ts makes the response private, no-store. As the account's
// order page: rendered on request, the order under <Suspense>, so a wrong key or an unknown number
// shows the not-found page (noindex) with a 200.
export const instant = false;

export default function GuestOrderPage({ params, searchParams }: PageProps<"/orders/[number]">) {
  return (
    <Container className="py-section">
      <Suspense fallback={<OrderSkeleton />}>
        <GuestOrder params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function GuestOrder({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ number }, query] = await Promise.all([params, searchParams]);
  const parsed = parseOrderNumber(number);
  const key = typeof query.key === "string" ? query.key : null;
  const order = parsed === null ? null : await getOrderForGuestKey(db, parsed, key);
  if (!order) notFound();
  // After the session or key was read, so the clock is request time.
  const now = new Date();
  return <OrderPage order={order} now={now} />;
}
