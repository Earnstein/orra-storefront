import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminPage, AdminPageSkeleton } from "@/components/admin/admin-page";
import { ProductForm } from "@/components/admin/product-form";
import { db } from "@/db";
import { libraryPhotos } from "@/lib/admin/products/library";
import { getAdminProduct, listCategories } from "@/lib/admin/products/queries";
import { toFormValues } from "@/lib/admin/products/schema";
import { requireAdmin } from "@/lib/admin/session";
import { roleCan } from "@/lib/auth/permissions";
import { serverEnv, uploadsConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Edit product" };
// A dynamic segment with no prerendered params: render on request (blocking), as the storefront's
// dynamic pages do. The admin nav reads the pathname, which a fallback shell can't know, and an
// unknown slug then answers a real 404.
export const instant = false;

// Rendered after requireAdmin, like every admin page (the layout's check doesn't gate pages).
export default function EditProductPage({ params }: PageProps<"/admin/products/[slug]">) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <EditProduct params={params} />
    </Suspense>
  );
}

async function EditProduct({ params }: Pick<PageProps<"/admin/products/[slug]">, "params">) {
  const { slug } = await params;
  const admin = await requireAdmin({ product: ["update"] }, `/admin/products/${encodeURIComponent(slug)}`);
  const [product, categories] = await Promise.all([getAdminProduct(db, slug), listCategories(db)]);
  if (!product) notFound();
  const { id, archived, held, ...input } = product;
  return (
    <AdminPage
      title={product.name}
      action={
        <Link href="/admin/products" className="eyebrow link-quiet">
          All products
        </Link>
      }
    >
      <ProductForm
        key={`${id}-${input.slug}`}
        product={{ id, expectedStock: input.stock, held, archived }}
        initial={toFormValues(input)}
        categories={categories}
        uploads={uploadsConfigured(serverEnv())}
        libraryPhotos={libraryPhotos()}
        canArchive={roleCan(admin.role, { product: ["archive"] })}
      />
    </AdminPage>
  );
}
