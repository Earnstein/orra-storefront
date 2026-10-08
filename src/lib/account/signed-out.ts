import { signInPath } from "@/lib/auth/return-to";
import { markSignedOut } from "@/lib/auth/signed-out-marker";

/**
 * When an account action answers "signed-out" (signed out in another tab, revoked from another
 * device), go to sign in and come back here. A full page load, so nothing rendered for the old
 * session stays in memory.
 */
export function goToSignIn(returnTo = "/account") {
  markSignedOut();
  window.location.replace(signInPath(returnTo));
}
