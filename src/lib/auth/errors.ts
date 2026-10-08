/** What a failed Better Auth call returns to the browser client: an error code and/or HTTP status. */
export type AuthError = { code?: string; status?: number };

export const GENERIC_ERROR = "Something went wrong. Try again.";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  USER_ALREADY_EXISTS: "An account with this email already exists.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists.",
  INVALID_TOKEN: "This link has expired or was already used.",
  INVALID_PASSWORD: "That password isn't right.",
  PASSWORD_REQUIRED: "Enter your password.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters.",
  PASSWORD_TOO_LONG: "Use at most 128 characters.",
};

/**
 * Plain copy for a failed auth call. Better Auth's rate limiter answers a bare 429 without a code,
 * so the status is checked too; anything unknown, including network failures, gets the generic line.
 */
export function authErrorMessage(error: AuthError | null | undefined): string {
  if (error?.code && error.code in MESSAGES) return MESSAGES[error.code];
  if (error?.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  return GENERIC_ERROR;
}
