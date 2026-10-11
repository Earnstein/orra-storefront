import { getCurrentUser } from "@/lib/auth/session";
import { getSavedSlugs } from "@/lib/saved/queries";

const PRIVATE = { "Cache-Control": "private, no-store" };

/** The signed-in user's saved slugs, newest first: `{ slugs }`, or 401 `{ error: "signed-out" }`. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed-out" }, { status: 401, headers: PRIVATE });
  return Response.json({ slugs: await getSavedSlugs(user.id) }, { headers: PRIVATE });
}
