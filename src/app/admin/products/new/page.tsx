import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminPage, AdminPageSkeleton } from "@/components/admin/admin-page";
import { ProductForm } from "@/components/admin/product-form";
import { db } from "@/db";
import { libraryPhotos } from "@/lib/admin/products/library";
import { listCategories } from "@/lib/admin/products/queries";
import { requireAdmin } from "@/lib/admin/session";
import { serverEnv, uploadsConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "New product" };

// Rendered after requireAdmin, like every admin page (the layout's check doesn't gate pages).
export default function NewProductPage() {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <NewProduct />
    </Suspense>
  );
}

async function NewProduct() {
  await requireAdmin({ product: ["create"] }, "/admin/products/new");
  const categories = await listCategories(db);
  return (
    <AdminPage title="New product">
      <ProductForm
        initial={{
          name: "",
          slug: "",
          categorySlug: "",
          audience: "unisex",
          colour: "",
          colourFamily: "black",
          material: "leather",
          price: "",
          stock: "0",
          description: "",
          details: [],
          images: [],
        }}
        categories={categories}
        uploads={uploadsConfigured(serverEnv())}
        libraryPhotos={libraryPhotos()}
        canArchive={false}
      />
    </AdminPage>
  );
}
