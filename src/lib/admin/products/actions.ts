"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { adminForAction } from "@/lib/admin/session";
import type { Permission } from "@/lib/auth/permissions";
import { createProduct, setArchived, updateProduct } from "./mutations";
import { productInput, type ProductField, type ProductInput, type ProductResult } from "./schema";

// The admin's product actions. Each checks the admin and the permission first (uncached session),
// parses everything it's sent, and on success refreshes the catalogue: updateTag("catalog")
// expires every cached catalogue read, and on Vercel purges the CDN's copies of the public
// catalogue routes, which carry the same tag (Vercel-Cache-Tag).

const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;
const id = z.number().int().positive();
const extras = z.object({ id: id.optional(), expectedStock: z.number().int().min(0).optional() });

async function guarded<T>(permission: Permission, run: () => Promise<ProductResult<T>>): Promise<ProductResult<T>> {
  const check = await adminForAction(permission);
  if (!check.ok) return check;
  try {
    const result = await run();
    if (result.ok) updateTag("catalog");
    return result;
  } catch (error) {
    console.error("admin: product write failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
}

/** Creates a product (no `id`) or saves an edit; `expectedStock` is the stock the form loaded. */
export async function saveProduct(
  input: ProductInput & { id?: number; expectedStock?: number },
): Promise<ProductResult<{ id: number; slug: string }>> {
  const editing = input?.id !== undefined;
  return guarded({ product: [editing ? "update" : "create"] }, async () => {
    const meta = extras.safeParse({ id: input?.id, expectedStock: input?.expectedStock });
    if (!meta.success) return { ok: false, error: "invalid", message: "This form is out of date — reload it." };
    const parsed = productInput.safeParse(input);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      return { ok: false, error: "invalid", message: issue.message, field: issue.path[0] as ProductField };
    }
    if (meta.data.id === undefined) return createProduct(db, parsed.data);
    return updateProduct(db, meta.data.id, parsed.data, meta.data.expectedStock);
  });
}

/** Hides a product from the storefront; orders, holds and saved items keep it. */
export async function archiveProduct(productId: number): Promise<ProductResult<null>> {
  return guarded({ product: ["archive"] }, async () => toNull(id.safeParse(productId).success ? await setArchived(db, productId, true) : NOT_FOUND));
}

/** Puts an archived product back on the storefront. */
export async function restoreProduct(productId: number): Promise<ProductResult<null>> {
  return guarded({ product: ["archive"] }, async () => toNull(id.safeParse(productId).success ? await setArchived(db, productId, false) : NOT_FOUND));
}

const NOT_FOUND = { ok: false, error: "not-found", message: "This product no longer exists." } as const;
const toNull = <T,>(result: ProductResult<T>): ProductResult<null> => (result.ok ? { ok: true, data: null } : result);
