import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPage, AdminPageSkeleton } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Products" };

// The products table arrives with the next module (feat/admin-products).
// Everything on the page renders after requireAdmin: the layout's check doesn't gate the page
// (Next renders a route's segments in parallel), so nothing is prerendered here.
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  await requireAdmin({ product: ["update"] }, "/admin/products");
  return <AdminPage title="Products" description="Add, edit and archive the catalogue." />;
}
