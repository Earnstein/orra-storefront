import { createAuthClient } from "better-auth/react";

// No baseURL: the client calls /api/auth on whichever origin served the page, so it works on
// production, every preview URL and localhost alike.
export const authClient = createAuthClient();
