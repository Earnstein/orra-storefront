import { listDevices } from "@/lib/account/devices";
import { getCurrentSession } from "@/lib/auth/session";

const PRIVATE = { "Cache-Control": "private, no-store" };

/** The signed-in user's devices for the account page: `{ devices }`, or 401 `{ error: "signed-out" }`. */
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return Response.json({ error: "signed-out" }, { status: 401, headers: PRIVATE });
  const devices = await listDevices(current.user.id, current.sessionId);
  return Response.json({ devices }, { headers: PRIVATE });
}
