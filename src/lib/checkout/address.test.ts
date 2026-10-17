import { describe, expect, it } from "vitest";

import { addressSchema, toStripeShipping, US_STATES } from "./address";

const valid = { name: "Ada Lovelace", line1: "1 Main Street", line2: "", city: "Brooklyn", state: "NY", postalCode: "11201" };
const errors = (value: object) => addressSchema.safeParse(value).error?.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) ?? [];

describe("the delivery address", () => {
  it("accepts a US address, with or without line 2 and with ZIP+4", () => {
    expect(errors(valid)).toEqual([]);
    expect(errors({ ...valid, line2: "Apt 4", postalCode: "11201-1234" })).toEqual([]);
  });

  it("asks for each required field in words", () => {
    expect(errors({ name: " ", line1: "", line2: "", city: "", state: "", postalCode: "" })).toEqual([
      "name: Enter your full name.",
      "line1: Enter your street address.",
      "city: Enter your city.",
      "state: Choose your state.",
      "postalCode: Enter a 5-digit US ZIP code, e.g. 11201.",
    ]);
  });

  it("refuses ZIP codes that aren't US ones, and states outside the list", () => {
    expect(errors({ ...valid, postalCode: "340221" })).toEqual(["postalCode: Enter a 5-digit US ZIP code, e.g. 11201."]);
    expect(errors({ ...valid, postalCode: "1120" })).toHaveLength(1);
    expect(errors({ ...valid, state: "ZZ" })).toEqual(["state: Choose your state."]);
    expect(errors({ ...valid, state: "New York" })).toHaveLength(1);
  });

  it("lists the 50 states and DC, each once", () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES.map((state) => state.code)).size).toBe(51);
  });

  it("hands Stripe the trimmed address in its shape, with no empty line 2", () => {
    expect(toStripeShipping({ ...valid, name: " Ada Lovelace ", postalCode: " 11201 " })).toEqual({
      name: "Ada Lovelace",
      address: { country: "US", line1: "1 Main Street", line2: null, city: "Brooklyn", state: "NY", postal_code: "11201" },
    });
    expect(toStripeShipping({ ...valid, line2: "Apt 4" }).address.line2).toBe("Apt 4");
  });
});
