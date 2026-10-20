import { db } from "@/db";
import { listAdminOrders } from "@/lib/admin/orders/queries";
import { adminCheck } from "@/lib/admin/session";
import { loadAdminOrderParams } from "@/lib/admin/table-params";
import { roleCan } from "@/lib/auth/permissions";

/**
 * The admin orders table's pages (`?q=&status=&page=`, src/lib/admin/table-params.ts). Needs
 * `order:read`; without `order:read-details` (the demo admin) names and emails come masked.
 * Never cached anywhere.
 */
export async function GET(request: Request): Promise<Response> {
  const admin = await adminCheck({ order: ["read"] });
  if (admin instanceof Response) return admin;
  const started = performance.now();
  const masked = !roleCan(admin.role, { order: ["read-details"] });
  const result = await listAdminOrders(db, loadAdminOrderParams(request.url), { masked });
  return Response.json(result, {
    headers: { "Cache-Control": "private, no-store", "Server-Timing": `db;dur=${Math.round(performance.now() - started)}` },
  });
}
