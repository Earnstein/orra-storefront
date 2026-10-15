import type { Metadata } from "next";
import { Suspense } from "react";

import { OrderList } from "@/components/orders/order-list";
import { Container } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { getOrdersForUser } from "@/lib/orders/queries";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false },
};

// As /account: a static shell, the list under <Suspense> once the session is checked.
export default function OrdersPage() {
  return (
    <Container size="content" className="py-section">
      <Suspense fallback={<OrdersSkeleton />}>
        <Orders />
      </Suspense>
    </Container>
  );
}

async function Orders() {
  const user = await requireUser("/account/orders");
  return <OrderList orders={await getOrdersForUser(db, user.id)} />;
}

function OrdersSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-block">
      <Skeleton className="h-10 w-56 max-w-full bg-surface" />
      <Skeleton className="h-28 bg-surface" />
      <Skeleton className="h-28 bg-surface" />
    </div>
  );
}
