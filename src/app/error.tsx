"use client";

/**
 * Errors thrown by a layout (the storefront's or the admin's), which their own error.tsx files
 * can't catch: the same message as the storefront's, without the header and footer.
 */
export { default } from "./(store)/error";
