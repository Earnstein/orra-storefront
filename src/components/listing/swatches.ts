import type { COLOUR_FAMILIES } from "@/lib/catalog/vocabulary";

/**
 * The colour filter's swatches: data, not theme tokens (a swatch shows the products' colour, not
 * the interface's). Multicolour is a pattern.
 */
export const SWATCHES: Record<(typeof COLOUR_FAMILIES)[number], string> = {
  black: "#111111",
  white: "#ffffff",
  grey: "#9b9b9b",
  beige: "#d8c6a8",
  brown: "#6e4b33",
  red: "#a8302a",
  pink: "#e5a9b8",
  orange: "#d9772f",
  yellow: "#e6c64d",
  green: "#3f6a47",
  blue: "#2e4f8c",
  purple: "#694c8b",
  gold: "#c5a250",
  silver: "#c2c4c7",
  multicolour: "conic-gradient(#a8302a, #e6c64d, #3f6a47, #2e4f8c, #694c8b, #a8302a)",
};
