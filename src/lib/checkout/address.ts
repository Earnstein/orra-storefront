import { z } from "zod";

/** The states and DC that delivery goes to (US only, as Stripe's session allows). */
export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

const STATE_CODES = new Set<string>(US_STATES.map((state) => state.code));

/**
 * The delivery address on /checkout (our own fields, so they look like the rest of the site; Stripe
 * gets the result when the shopper pays). Errors read as instructions, like the auth forms'.
 */
export const addressSchema = z.object({
  name: z.string().trim().min(1, "Enter your full name.").max(100, "Use at most 100 characters."),
  line1: z.string().trim().min(1, "Enter your street address.").max(200, "Use at most 200 characters."),
  line2: z.string().trim().max(200, "Use at most 200 characters."),
  city: z.string().trim().min(1, "Enter your city.").max(100, "Use at most 100 characters."),
  state: z.string().refine((code) => STATE_CODES.has(code), "Choose your state."),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit US ZIP code, e.g. 11201."),
});

export type Address = z.input<typeof addressSchema>;

/** The address in the shape Stripe's checkout takes (`confirm({ shippingAddress })`). */
export function toStripeShipping(address: Address) {
  const value = addressSchema.parse(address);
  return {
    name: value.name,
    address: { country: "US", line1: value.line1, line2: value.line2 || null, city: value.city, state: value.state, postal_code: value.postalCode },
  };
}
