import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OrderPage } from "@/components/orders/order-page";
import { OrderSkeleton } from "@/components/orders/order-skeleton";
import { Container } from "@/components/primitives";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { parseOrderNumber } from "@/lib/orders/number";
import { getOrderForUser } from "@/lib/orders/queries";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false },
};

// A dynamic segment the shared providers can't prerender (they read the path), so it renders on
// request (`instant = false`, as the product pages). The order, which needs the session, streams
// under <Suspense> after the shell, so another user's order or an unknown number shows the
// not-found page (noindex) with a 200: Cache Components streams every dynamic route's shell first,
// and a real 404 would need a database read in the proxy. The page reveals nothing either way.
export const instant = false;

export default function AccountOrderPage({ params }: PageProps<"/account/orders/[number]">) {
  return (
    <Container className="py-section">
      <Suspense fallback={<OrderSkeleton />}>
        <AccountOrder params={params} />
      </Suspense>
    </Container>
  );
}

async function AccountOrder({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const user = await requireUser(`/account/orders/${encodeURIComponent(number)}`);
  const parsed = parseOrderNumber(number);
  const order = parsed === null ? null : await getOrderForUser(db, user.id, parsed);
  if (!order) notFound();
  // After the session or key was read, so the clock is request time.
  const now = new Date();
  return <OrderPage order={order} now={now} back={{ href: "/account/orders", label: "All orders" }} />;
}
