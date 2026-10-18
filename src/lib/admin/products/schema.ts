import { z } from "zod";

import { AUDIENCES, COLOUR_FAMILIES, MATERIALS } from "@/lib/catalog/vocabulary";
import { SLUG_MAX, SLUG_PATTERN } from "@/lib/saved/limits";

// What the admin's product form sends (client-safe: the form validates with it too, and the
// server actions parse every request with it). Prices are integer cents.

/** $0.50, Stripe's smallest charge, in cents. */
export const PRICE_MIN = 50;
/** $1,000,000, in cents. */
export const PRICE_MAX = 100_000_000;
export const STOCK_MAX = 100_000;
export const IMAGES_MAX = 8;
export const DETAILS_MAX = 12;

/** Where product photos may live: Unsplash (the seed) and our Vercel Blob store (uploads). */
export function isProductImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // https only, no port, and nothing before the host (an address can't smuggle in credentials).
  if (url.protocol !== "https:" || url.port || !url.href.startsWith(`https://${url.host}/`)) return false;
  if (url.hostname === "images.unsplash.com") return true;
  // Which store is checked on the server (isAllowedPhoto in uploads.ts), which knows its token.
  return url.hostname.endsWith(".public.blob.vercel-storage.com") && url.pathname.startsWith("/products/");
}

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Use at most ${max} characters.`);

export const productInput = z.object({
  name: text("a name", 120),
  slug: z
    .string()
    .trim()
    .min(1, "Enter a slug.")
    .max(SLUG_MAX, `Use at most ${SLUG_MAX} characters.`)
    // Only once something's typed, so an empty slug says just "Enter a slug."
    .refine((slug) => slug === "" || SLUG_PATTERN.test(slug), "Use lower-case letters, digits and single hyphens.")
    // /admin/products/new is the editor for a new product.
    .refine((slug) => slug !== "new", "This slug is reserved."),
  categorySlug: z.string().min(1, "Choose a category."),
  audience: z.enum(AUDIENCES, "Choose who it's for."),
  colour: text("the colour", 60),
  colourFamily: z.enum(COLOUR_FAMILIES, "Choose a colour family."),
  material: z.enum(MATERIALS, "Choose a material."),
  price: z.number("Enter a price.").int("Use whole cents.").min(PRICE_MIN, "The price must be at least $0.50.").max(PRICE_MAX, "The price can be at most $1,000,000."),
  stock: z.number("Enter the stock.").int("Use a whole number.").min(0, "Stock can't be negative.").max(STOCK_MAX, `Stock can be at most ${STOCK_MAX.toLocaleString("en-US")}.`),
  description: text("a description", 2000),
  details: z.array(z.object({ term: text("a label", 40), value: text("a value", 200) })).max(DETAILS_MAX, `Add at most ${DETAILS_MAX} details.`),
  images: z
    .array(
      z.object({
        src: z.string().refine(isProductImageUrl, "Use an uploaded photo or an images.unsplash.com address."),
        alt: text("a description of the photo for people who can't see it", 200),
      }),
    )
    .min(1, "Add at least one photo.")
    .max(IMAGES_MAX, `Add at most ${IMAGES_MAX} photos.`),
});

export type ProductInput = z.infer<typeof productInput>;
export type ProductField = keyof ProductInput;

/** A URL slug from a product name: "Leather Tote — Tan" → "leather-tote-tan". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

/** What product actions answer. `field` names the input an "invalid" answer is about. */
export type ProductResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "signed-out" | "forbidden" | "invalid" | "not-found" | "failed"; message: string; field?: ProductField };

// The editor's values: price in dollars and stock as typed, converted by toProductInput.
const dollars = z
  .string()
  .trim()
  .min(1, "Enter a price.")
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), "Use a price like 1290 or 1290.50.")
  .refine((value) => value === "" || Math.round(Number(value) * 100) >= PRICE_MIN, "The price must be at least $0.50.")
  .refine((value) => Math.round(Number(value) * 100) <= PRICE_MAX, "The price can be at most $1,000,000.");
const units = z
  .string()
  .trim()
  .min(1, "Enter the stock.")
  .refine((value) => value === "" || /^\d+$/.test(value), "Use a whole number.")
  .refine((value) => Number(value) <= STOCK_MAX, `Stock can be at most ${STOCK_MAX.toLocaleString("en-US")}.`);

export const productFormSchema = productInput.extend({ price: dollars, stock: units });
export type ProductFormValues = z.input<typeof productFormSchema>;

export function toProductInput(values: ProductFormValues): ProductInput {
  return { ...values, price: Math.round(Number(values.price) * 100), stock: Number(values.stock) };
}

/** A product's values as the editor shows them (price in dollars). */
export function toFormValues(input: ProductInput): ProductFormValues {
  return { ...input, price: (input.price / 100).toFixed(2).replace(/\.00$/, ""), stock: String(input.stock) };
}
