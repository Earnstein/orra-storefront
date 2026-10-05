// The catalogue's fixed vocabularies. The database enums (src/db/schema/catalog.ts) are built from
// these lists, and client code validates URL values against them without importing Drizzle.

export const AUDIENCES = ["women", "men", "unisex"] as const;

export const COLOUR_FAMILIES = [
  "black",
  "white",
  "grey",
  "beige",
  "brown",
  "red",
  "pink",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "gold",
  "silver",
  "multicolour",
] as const;

export const MATERIALS = [
  "leather",
  "suede",
  "canvas",
  "nylon",
  "cotton",
  "linen",
  "wool",
  "cashmere",
  "silk",
  "satin",
  "gold",
  "silver",
  "metal",
  "acetate",
  "mixed",
] as const;
