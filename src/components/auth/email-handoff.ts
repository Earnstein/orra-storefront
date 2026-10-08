// Carries an email from /sign-up ("Sign in instead") to /sign-in for this tab only, so it never
// goes in a URL (where it would land in history, logs and analytics).
const KEY = "orra:sign-in-email";

export function handOffEmail(email: string) {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    // Storage blocked: the visitor types the email again.
  }
}

/** The handed-off email, once; null when there is none. */
export function takeHandedOffEmail(): string | null {
  try {
    const email = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return email;
  } catch {
    return null;
  }
}
