import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPage, AdminPageSkeleton } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Orders" };

// The orders table arrives with module 4 (feat/admin-orders).
// Everything on the page renders after requireAdmin: the layout's check doesn't gate the page
// (Next renders a route's segments in parallel), so nothing is prerendered here.
export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Orders />
    </Suspense>
  );
}

async function Orders() {
  await requireAdmin({ order: ["read"] }, "/admin/orders");
  return <AdminPage title="Orders" description="Fulfil, cancel and look up orders." />;
}
