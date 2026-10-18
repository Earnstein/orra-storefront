import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AdminPage, AdminPageSkeleton } from "@/components/admin/admin-page";
import { ProductsTable } from "@/components/admin/products-table";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { listAdminProducts } from "@/lib/admin/products/queries";
import { requireAdmin } from "@/lib/admin/session";
import { adminProductsPath, loadAdminProductParams } from "@/lib/admin/table-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Products" };

// Everything on the page renders after requireAdmin: the layout's check doesn't gate the page
// (Next renders a route's segments in parallel), so nothing is prerendered here.
export default function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <Products searchParams={searchParams} />
    </Suspense>
  );
}

async function Products({ searchParams }: Pick<PageProps<"/admin/products">, "searchParams">) {
  await requireAdmin({ product: ["update"] }, "/admin/products");
  const params = loadAdminProductParams(await searchParams);
  const initial = await listAdminProducts(db, params);
  return (
    <AdminPage
      title="Products"
      description="Add, edit and archive the catalogue."
      action={
        <Link href="/admin/products/new" className={cn(buttonVariants())}>
          Add product
        </Link>
      }
    >
      <ProductsTable initial={initial} initialPath={adminProductsPath(params)} />
    </AdminPage>
  );
}
