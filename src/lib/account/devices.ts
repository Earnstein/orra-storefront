import "server-only";

import { deviceLabel } from "@/lib/account/device-label";
import { auth } from "@/lib/auth";

/** A signed-in device as the account page shows it: no session token ever leaves the server. */
export type Device = { id: string; label: string; updatedAt: string; current: boolean };

/**
 * The user's active sessions, this one first, then the most recently active. Read through Better
 * Auth's internal adapter rather than its /list-sessions endpoint, which refuses sessions created
 * more than a day ago (its "fresh session" rule) and would hand the browser every session's token.
 * Callers check the session first (getCurrentSession).
 */
export async function listDevices(userId: string, currentSessionId: string): Promise<Device[]> {
  const sessions = await activeSessions(userId);
  return sessions
    .map((session) => ({
      id: session.id,
      label: deviceLabel(session.userAgent),
      updatedAt: new Date(session.updatedAt).toISOString(),
      current: session.id === currentSessionId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || b.updatedAt.localeCompare(a.updatedAt));
}

/** Ends one of the user's sessions by id. False when it isn't theirs (or no longer exists). */
export async function endSession(userId: string, sessionId: string): Promise<boolean> {
  const target = (await activeSessions(userId)).find((session) => session.id === sessionId);
  if (!target) return false;
  await (await auth.$context).internalAdapter.deleteSession(target.token);
  return true;
}

/** Ends every session of the user's except `keepSessionId`. */
export async function endOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  const others = (await activeSessions(userId)).filter((session) => session.id !== keepSessionId);
  if (others.length > 0) await (await auth.$context).internalAdapter.deleteSessions(others.map((session) => session.token));
}

async function activeSessions(userId: string) {
  const { internalAdapter } = await auth.$context;
  return internalAdapter.listSessions(userId, { onlyActiveSessions: true });
}
