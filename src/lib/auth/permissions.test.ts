import { describe, expect, it } from "vitest";

import { adminRoleOf, roleCan } from "./permissions";

describe("roleCan", () => {
  it("lets the owner do everything", () => {
    expect(roleCan("admin", { order: ["cancel"] })).toBe(true);
    expect(roleCan("admin", { order: ["read-details", "fulfil"], product: ["archive", "upload"] })).toBe(true);
  });

  it("lets the demo admin edit products and read masked orders only", () => {
    expect(roleCan("demo-admin", { product: ["create", "update", "archive", "upload"] })).toBe(true);
    expect(roleCan("demo-admin", { order: ["read"] })).toBe(true);
    expect(roleCan("demo-admin", { order: ["read-details"] })).toBe(false);
    expect(roleCan("demo-admin", { order: ["cancel"] })).toBe(false);
    expect(roleCan("demo-admin", { order: ["fulfil"] })).toBe(false);
    expect(roleCan("demo-admin", { product: ["update"], order: ["cancel"] })).toBe(false);
  });

  it("gives shoppers and unknown roles nothing", () => {
    expect(roleCan("user", { product: ["update"] })).toBe(false);
    expect(roleCan(undefined, { product: ["update"] })).toBe(false);
    expect(roleCan(null, { order: ["read"] })).toBe(false);
    expect(roleCan("", { order: ["read"] })).toBe(false);
    expect(roleCan("constructor", { order: ["read"] })).toBe(false);
    expect(roleCan("owner", { order: ["read"] })).toBe(false);
  });

  it("never grants an empty permission", () => {
    expect(roleCan("admin", {})).toBe(false);
  });

  it("reads comma-separated roles as Better Auth does", () => {
    expect(roleCan("user,demo-admin", { product: ["update"] })).toBe(true);
    expect(roleCan("user, admin", { order: ["cancel"] })).toBe(true);
  });
});

describe("adminRoleOf", () => {
  it("finds the admin role among a user's roles", () => {
    expect(adminRoleOf("admin")).toBe("admin");
    expect(adminRoleOf("user,demo-admin")).toBe("demo-admin");
    expect(adminRoleOf("user")).toBeNull();
    expect(adminRoleOf(undefined)).toBeNull();
    expect(adminRoleOf("administrator")).toBeNull();
  });
});
