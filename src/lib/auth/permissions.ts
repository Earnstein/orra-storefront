import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Who may do what in the admin (the M6 spec). Client-safe: Better Auth's admin plugin checks its
 * own user and session endpoints with these roles, our server checks call `roleCan`, and the UI
 * uses it to hide what a role can't do (never as the only check).
 */
export const statements = {
  ...defaultStatements,
  product: ["create", "update", "archive", "upload"],
  // read-details: the shopper's unmasked name, email and address.
  order: ["read", "read-details", "fulfil", "cancel"],
} as const;

export type ProductAction = (typeof statements.product)[number];
export type OrderAction = (typeof statements.order)[number];
export type Permission = { product?: ProductAction[]; order?: OrderAction[] };

export const ac = createAccessControl(statements);

export const roles = {
  // The owner: everything here, plus the plugin's user and session actions.
  admin: ac.newRole({ ...adminAc.statements, product: [...statements.product], order: [...statements.order] }),
  // The shared demo account: edits products (reset nightly) and reads masked orders. No user or
  // session actions, so the plugin's endpoints answer it 403.
  "demo-admin": ac.newRole({ product: [...statements.product], order: ["read"] }),
  user: ac.newRole({ user: [], session: [] }),
};

export type AdminRole = "admin" | "demo-admin";
export const ADMIN_ROLES: readonly AdminRole[] = ["admin", "demo-admin"];

/** The admin role among a user's roles (Better Auth stores them comma-separated), if any. */
export function adminRoleOf(role: string | null | undefined): AdminRole | null {
  const held = splitRoles(role);
  return ADMIN_ROLES.find((admin) => held.includes(admin)) ?? null;
}

/** Whether any of a user's roles grants every action in `permission`. An empty permission is never granted. */
export function roleCan(role: string | null | undefined, permission: Permission): boolean {
  return splitRoles(role).some((name) => Object.hasOwn(roles, name) && roles[name as keyof typeof roles].authorize(permission).success);
}

/** Whether the roles include the demo admin's: the shared public account, whose own details can't be changed. */
export function isDemoAdmin(role: string | null | undefined): boolean {
  return splitRoles(role).includes("demo-admin");
}

function splitRoles(role: string | null | undefined): string[] {
  // Exactly as the admin plugin splits them (no trimming), so our checks and its endpoints agree.
  return (role ?? "").split(",").filter(Boolean);
}
