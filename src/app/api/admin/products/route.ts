import { db } from "@/db";
import { adminCheck } from "@/lib/admin/session";
import { listAdminProducts } from "@/lib/admin/products/queries";
import { loadAdminProductParams } from "@/lib/admin/table-params";

/**
 * The admin products table's pages (`?q=&sort=&dir=&status=&page=`, src/lib/admin/table-params.ts).
 * Admins only (401 signed out, 404 otherwise); never cached anywhere.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await adminCheck({ product: ["update"] });
  if (admin instanceof Response) return admin;
  const started = performance.now();
  const result = await listAdminProducts(db, loadAdminProductParams(request.url));
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store", "Server-Timing": `db;dur=${Math.round(performance.now() - started)}` },
  });
}
