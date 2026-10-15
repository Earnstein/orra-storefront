/** "ORR-10001": how an order number is shown (and typed into its URL). */
export function formatOrderNumber(number: number): string {
  return `ORR-${number}`;
}

/** The number in "ORR-10001" (case-insensitive), or null for anything else. */
export function parseOrderNumber(value: string): number | null {
  const match = /^ORR-(\d{5,9})$/i.exec(value);
  return match ? Number(match[1]) : null;
}
