import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPage } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Orders" };

// The orders table arrives with module 4 (feat/admin-orders).
export default function AdminOrdersPage() {
  return (
    <AdminPage title="Orders" description="Fulfil, cancel and look up orders.">
      <Suspense>
        <Check />
      </Suspense>
    </AdminPage>
  );
}

async function Check() {
  await requireAdmin({ order: ["read"] }, "/admin/orders");
  return null;
}
