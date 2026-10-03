/** Units at or below which we tell shoppers stock is running out. */
export const LOW_STOCK_THRESHOLD = 3;

export type StockStatus =
  | { state: "in_stock"; label: string }
  | { state: "low_stock"; label: string }
  | { state: "out_of_stock"; label: string };

/** Shopper-facing stock status, derived from units available. */
export function stockStatus(units: number): StockStatus {
  if (units <= 0) return { state: "out_of_stock", label: "Sold out" };
  if (units <= LOW_STOCK_THRESHOLD) return { state: "low_stock", label: `Only ${units} left` };
  return { state: "in_stock", label: "In stock" };
}
