import type { CatalogImage } from "@/lib/catalog/types";

/**
 * A bag line as the shopper sees it, with live stock. `note` says what changed on this read:
 * "reduced" when stock fell below the quantity (it was lowered), "sold-out" when none are left,
 * "unavailable" when the product was archived (both stay in the bag, but aren't counted or charged).
 */
export type BagLine = {
  slug: string;
  name: string;
  colour: string;
  unitPrice: number;
  image: CatalogImage | null;
  stock: number;
  quantity: number;
  note: "reduced" | "sold-out" | "unavailable" | null;
};

/** Whether a line can be bought now (counted, charged and taken to checkout). */
export function isBuyable(line: BagLine): boolean {
  return line.note !== "sold-out" && line.note !== "unavailable";
}

/** `count` and `subtotal` (cents) leave out lines that can't be bought (`isBuyable`). */
export type Bag = { lines: BagLine[]; count: number; subtotal: number; currency: "USD" };

export const EMPTY_BAG: Bag = { lines: [], count: 0, subtotal: 0, currency: "USD" };
