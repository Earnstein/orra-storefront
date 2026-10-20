import { listDevices } from "@/lib/account/devices";
import { isDemoAdmin } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";

const PRIVATE = { "Cache-Control": "private, no-store" };

/** The signed-in user's devices for the account page: `{ devices }`, or 401 `{ error: "signed-out" }`. */
export async function GET() {
  const current = await getCurrentSession();
  if (!current) return Response.json({ error: "signed-out" }, { status: 401, headers: PRIVATE });
  const devices = await listDevices(current.user.id, current.sessionId);
  // The shared demo account is signed in by other visitors too: show this device only.
  return Response.json({ devices: isDemoAdmin(current.role) ? devices.filter((device) => device.current) : devices }, { headers: PRIVATE });
}
