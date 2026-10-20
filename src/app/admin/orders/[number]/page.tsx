import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminOrderView } from "@/components/admin/admin-order";
import { AdminPageSkeleton } from "@/components/admin/admin-page";
import { db } from "@/db";
import { getAdminOrder } from "@/lib/admin/orders/queries";
import { requireAdmin } from "@/lib/admin/session";
import { roleCan } from "@/lib/auth/permissions";
import { parseOrderNumber } from "@/lib/orders/number";

export const metadata: Metadata = { title: "Order" };
// A dynamic segment with no prerendered params: render on request (blocking), as the product
// editor does (the admin nav reads the pathname, which a fallback shell can't know).
export const instant = false;

// Rendered after requireAdmin, like every admin page (the layout's check doesn't gate pages).
export default function AdminOrderPage({ params }: PageProps<"/admin/orders/[number]">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Order params={params} />
    </Suspense>
  );
}

async function Order({ params }: Pick<PageProps<"/admin/orders/[number]">, "params">) {
  const { number } = await params;
  const admin = await requireAdmin({ order: ["read"] }, `/admin/orders/${encodeURIComponent(number)}`);
  const parsed = parseOrderNumber(number);
  const order = parsed === null ? null : await getAdminOrder(db, parsed, { masked: !roleCan(admin.role, { order: ["read-details"] }) });
  if (!order) notFound();
  return (
    <AdminOrderView
      order={order}
      canFulfil={roleCan(admin.role, { order: ["fulfil"] })}
      canCancel={roleCan(admin.role, { order: ["cancel"] })}
      back={
        <Link href="/admin/orders" className="eyebrow link-quiet">
          All orders
        </Link>
      }
    />
  );
}
