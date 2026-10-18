import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPage } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Products" };

// The products table arrives with the next module (feat/admin-products).
export default function AdminProductsPage() {
  return (
    <AdminPage title="Products" description="Add, edit and archive the catalogue.">
      <Suspense>
        <Check />
      </Suspense>
    </AdminPage>
  );
}

async function Check() {
  await requireAdmin({ product: ["update"] }, "/admin/products");
  return null;
}
