/** Complimentary delivery window, in business days after the order date. */
export const DELIVERY_BUSINESS_DAYS = { min: 2, max: 4 } as const;

function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

/** Earliest and latest delivery dates for an order placed at `orderedAt`. */
export function deliveryWindow(orderedAt: Date): { earliest: Date; latest: Date } {
  return {
    earliest: addBusinessDays(orderedAt, DELIVERY_BUSINESS_DAYS.min),
    latest: addBusinessDays(orderedAt, DELIVERY_BUSINESS_DAYS.max),
  };
}
