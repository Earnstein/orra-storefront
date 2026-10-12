import type { CatalogImage } from "@/lib/catalog/types";

/**
 * A bag line as the shopper sees it, with live stock. `note` says what changed on this read:
 * "reduced" when stock fell below the quantity (it was lowered), "sold-out" when none are left
 * (the line stays, but isn't counted or charged).
 */
export type BagLine = {
  slug: string;
  name: string;
  colour: string;
  unitPrice: number;
  image: CatalogImage | null;
  stock: number;
  quantity: number;
  note: "reduced" | "sold-out" | null;
};

/** `count` and `subtotal` (cents) leave out sold-out lines. */
export type Bag = { lines: BagLine[]; count: number; subtotal: number; currency: "USD" };

export const EMPTY_BAG: Bag = { lines: [], count: 0, subtotal: 0, currency: "USD" };
