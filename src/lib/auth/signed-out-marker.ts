// Records when this browser last signed out (or deleted its account), so pages restored from the
// back/forward cache that were left while signed in can reload themselves (useReloadAfterSignOut).
const SIGNED_OUT_AT = "orra:signed-out-at";

export function markSignedOut() {
  try {
    localStorage.setItem(SIGNED_OUT_AT, String(Date.now()));
  } catch {
    // Private mode or blocked storage: the back/forward cache check just won't fire.
  }
}

/** When this browser last signed out (ms since the epoch), or 0. */
export function lastSignedOutAt(): number {
  try {
    return Number(localStorage.getItem(SIGNED_OUT_AT)) || 0;
  } catch {
    return 0;
  }
}
