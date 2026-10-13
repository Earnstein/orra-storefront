import { describe, expect, it } from "vitest";

import { phoneSchema, usPhone } from "./phone";

describe("usPhone", () => {
  it.each(["(201) 555-0123", "201.555.0123", "2015550123", "+1 201 555 0123", "1-201-555-0123"])("reads %s", (value) => {
    expect(usPhone(value)).toBe("+12015550123");
  });

  it.each(["", "555-0123", "(101) 555-0123", "(201) 155-0123", "+44 20 7946 0958", "201555012345"])("refuses %s", (value) => {
    expect(usPhone(value)).toBeNull();
  });
});

describe("phoneSchema", () => {
  it("asks for a number, then for a US one", () => {
    expect(phoneSchema.safeParse("").error?.issues[0]?.message).toBe("Enter a phone number for delivery.");
    expect(phoneSchema.safeParse("12345").error?.issues[0]?.message).toBe("Enter a US phone number, e.g. (201) 555-0123.");
    expect(phoneSchema.safeParse(" (201) 555-0123 ").success).toBe(true);
  });
});
