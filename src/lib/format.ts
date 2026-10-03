import { site } from "@/lib/site";

const priceFormat = new Intl.NumberFormat(site.locale, {
  style: "currency",
  currency: site.currency,
  maximumFractionDigits: 0,
});

/** Prices are stored as integer minor units (cents); format only for display. */
export function formatPrice(minorUnits: number) {
  return priceFormat.format(minorUnits / 100);
}
