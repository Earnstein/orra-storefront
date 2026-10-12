// Bag limits, shared by the server mutations and the client (no server imports here).

/** At most this many of one item in a bag, and never more than live stock. */
export const MAX_QUANTITY = 10;

/** At most this many lines (distinct products) in a bag. */
export const BAG_LINE_LIMIT = 50;
