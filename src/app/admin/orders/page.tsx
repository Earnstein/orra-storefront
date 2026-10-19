import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPage, AdminPageSkeleton } from "@/components/admin/admin-page";
import { OrdersTable } from "@/components/admin/orders-table";
import { db } from "@/db";
import { listAdminOrders } from "@/lib/admin/orders/queries";
import { requireAdmin } from "@/lib/admin/session";
import { adminOrdersPath, loadAdminOrderParams } from "@/lib/admin/table-params";
import { roleCan } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Orders" };

// Everything on the page renders after requireAdmin: the layout's check doesn't gate the page
// (Next renders a route's segments in parallel), so nothing is prerendered here.
export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  const admin = await requireAdmin({ order: ["read"] }, "/admin/orders");
  const masked = !roleCan(admin.role, { order: ["read-details"] });
  const params = loadAdminOrderParams(await searchParams);
  const initial = await listAdminOrders(db, params, { masked });
  return (
    <AdminPage
      title="Orders"
      description={masked ? "Customer names, emails and addresses are hidden in the demo." : "Fulfil, cancel and look up orders."}
    >
      <OrdersTable initial={initial} initialPath={adminOrdersPath(params)} masked={masked} />
    </AdminPage>
  );
}
