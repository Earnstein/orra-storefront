// Carries "this browser just deleted its account" to the homepage for this tab only. The homepage
// shows its notice only when both this flag and `?deleted=1` are present, so a link alone can't
// make it appear.
const KEY = "orra:account-deleted";

export function flagAccountDeleted() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the homepage just won't show the notice.
  }
}

/** Whether the flag was set, clearing it. */
export function takeAccountDeletedFlag(): boolean {
  try {
    const set = sessionStorage.getItem(KEY) === "1";
    sessionStorage.removeItem(KEY);
    return set;
  } catch {
    return false;
  }
}
