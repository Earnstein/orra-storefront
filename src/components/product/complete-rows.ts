import { cn } from "@/lib/utils";

/**
 * Classes for card `index` of `count` in a Grid layout="products" (2 columns, 3 from md, 4 from
 * xl): hidden at a column count where it would start an incomplete last row, so no card sits
 * alone. A row shorter than the column count shows in full.
 */
export function completeRows(index: number, count: number): string {
  const fits = (columns: number) => index < Math.max(columns, count - (count % columns));
  return cn(!fits(2) && "max-md:hidden", !fits(3) && "md:max-xl:hidden", !fits(4) && "xl:hidden");
}
