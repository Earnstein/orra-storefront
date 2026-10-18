import { describe, expect, it } from "vitest";

import { isProductImageUrl, PRICE_MAX, productFormSchema, productInput, slugify, STOCK_MAX, toFormValues, toProductInput, type ProductInput } from "./schema";

const valid: ProductInput = {
  name: "Leather tote",
  slug: "leather-tote-tan",
  categorySlug: "bags",
  audience: "women",
  colour: "Tan",
  colourFamily: "brown",
  material: "leather",
  price: 129_000,
  stock: 4,
  description: "A tote.",
  details: [{ term: "Size", value: "40 × 30 cm" }],
  images: [{ src: "https://images.unsplash.com/photo-1", alt: "The tote on a table" }],
};

const issues = (input: unknown) => productInput.safeParse(input).error?.issues.map((issue) => [issue.path.join("."), issue.message]) ?? [];

describe("productInput", () => {
  it("accepts a complete product", () => {
    expect(productInput.parse(valid)).toEqual(valid);
  });

  it("keeps price and stock inside their limits, in whole units", () => {
    expect(issues({ ...valid, price: -1 })).toEqual([["price", "The price can't be negative."]]);
    expect(issues({ ...valid, price: PRICE_MAX + 1 })).toEqual([["price", "The price can be at most $1,000,000."]]);
    expect(issues({ ...valid, price: 10.5 })).toEqual([["price", "Use whole cents."]]);
    expect(issues({ ...valid, stock: -1 })).toEqual([["stock", "Stock can't be negative."]]);
    expect(issues({ ...valid, stock: STOCK_MAX + 1 })).toEqual([["stock", "Stock can be at most 100,000."]]);
    expect(issues({ ...valid, price: PRICE_MAX, stock: STOCK_MAX })).toEqual([]);
  });

  it("needs at least one photo, each with alt text, from an allowed host", () => {
    expect(issues({ ...valid, images: [] })).toEqual([["images", "Add at least one photo."]]);
    expect(issues({ ...valid, images: [{ src: valid.images[0].src, alt: "  " }] })[0]?.[0]).toBe("images.0.alt");
    expect(issues({ ...valid, images: [{ src: "https://evil.example/x.jpg", alt: "x" }] })[0]?.[0]).toBe("images.0.src");
  });

  it("refuses a malformed slug and an unknown vocabulary value", () => {
    expect(issues({ ...valid, slug: "Leather Tote" })[0]?.[0]).toBe("slug");
    expect(issues({ ...valid, slug: "new" })).toEqual([["slug", "This slug is reserved."]]);
    expect(issues({ ...valid, material: "unobtainium" })[0]?.[0]).toBe("material");
  });

  it("trims text", () => {
    expect(productInput.parse({ ...valid, name: "  Leather tote " }).name).toBe("Leather tote");
  });
});

describe("isProductImageUrl", () => {
  it("allows Unsplash and our Blob store over https only", () => {
    expect(isProductImageUrl("https://images.unsplash.com/photo-123")).toBe(true);
    expect(isProductImageUrl("https://abc123.public.blob.vercel-storage.com/products/x.webp")).toBe(true);
    expect(isProductImageUrl("http://images.unsplash.com/photo-123")).toBe(false);
    expect(isProductImageUrl("https://images.unsplash.com.evil.example/x")).toBe(false);
    expect(isProductImageUrl("https://user@images.unsplash.com/photo-1")).toBe(false);
    expect(isProductImageUrl("not a url")).toBe(false);
  });
});

describe("slugify", () => {
  it("turns a name into a slug", () => {
    expect(slugify("Leather Tote — Tan")).toBe("leather-tote-tan");
    expect(slugify("  Café crème  ")).toBe("cafe-creme");
    expect(slugify("!!!")).toBe("");
    expect(slugify("a".repeat(99) + " bc").length).toBeLessThanOrEqual(100);
    expect(slugify("a".repeat(99) + " bc")).not.toMatch(/-$/);
  });
});

describe("the editor's values", () => {
  it("enter the price in dollars and convert to cents both ways", () => {
    expect(toFormValues(valid)).toMatchObject({ price: "1290", stock: "4" });
    expect(toFormValues({ ...valid, price: 129_050 })).toMatchObject({ price: "1290.50" });
    expect(toProductInput({ ...toFormValues(valid), price: "1290.5" })).toMatchObject({ price: 129_050, stock: 4 });
    expect(toProductInput({ ...toFormValues(valid), price: "0.29" }).price).toBe(29);
  });

  it("refuse prices and stock that aren't plain numbers in range", () => {
    const form = (overrides: object) => productFormSchema.safeParse({ ...toFormValues(valid), ...overrides }).error?.issues[0]?.message;
    expect(form({ price: "12,90" })).toBe("Use a price like 1290 or 1290.50.");
    expect(form({ price: "1.999" })).toBe("Use a price like 1290 or 1290.50.");
    expect(form({ price: "1000000.01" })).toBe("The price can be at most $1,000,000.");
    expect(form({ stock: "2.5" })).toBe("Use a whole number.");
    expect(form({ stock: "100001" })).toBe("Stock can be at most 100,000.");
    expect(form({})).toBeUndefined();
    const all = (overrides: object) => productFormSchema.safeParse({ ...toFormValues(valid), ...overrides }).error?.issues.map((issue) => issue.message);
    expect(all({ price: "" })).toEqual(["Enter a price."]);
    expect(all({ stock: "" })).toEqual(["Enter the stock."]);
    expect(all({ slug: "" })).toEqual(["Enter a slug."]);
  });
});
