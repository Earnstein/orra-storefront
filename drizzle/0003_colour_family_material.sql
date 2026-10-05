CREATE TYPE "public"."colour_family" AS ENUM('black', 'white', 'grey', 'beige', 'brown', 'red', 'pink', 'orange', 'yellow', 'green', 'blue', 'purple', 'gold', 'silver', 'multicolour');--> statement-breakpoint
CREATE TYPE "public"."material" AS ENUM('leather', 'suede', 'canvas', 'nylon', 'cotton', 'linen', 'wool', 'cashmere', 'silk', 'satin', 'gold', 'silver', 'metal', 'acetate', 'mixed');--> statement-breakpoint
-- Production is migrated but never seeded: add the columns empty, fill the existing products by
-- slug (any other row becomes multicolour / mixed), then make them required.
ALTER TABLE "products" ADD COLUMN "colour_family" "colour_family";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "material" "material";--> statement-breakpoint
UPDATE "products" SET
"colour_family" = (CASE "slug"
	WHEN 'top-handle-bag-teal' THEN 'green'
	WHEN 'double-monk-shoe' THEN 'brown'
	WHEN 'round-sunglasses' THEN 'gold'
	WHEN 'gold-hoop-earrings' THEN 'gold'
	WHEN 'leather-biker-jacket' THEN 'black'
	WHEN 'bomber-jacket-rust' THEN 'orange'
	WHEN 'floral-pump' THEN 'blue'
	WHEN 'fringed-knit-poncho' THEN 'beige'
	WHEN 'leather-tote-tan' THEN 'brown'
	ELSE 'multicolour'
END)::"colour_family",
"material" = (CASE "slug"
	WHEN 'top-handle-bag-teal' THEN 'leather'
	WHEN 'double-monk-shoe' THEN 'leather'
	WHEN 'round-sunglasses' THEN 'metal'
	WHEN 'gold-hoop-earrings' THEN 'gold'
	WHEN 'leather-biker-jacket' THEN 'leather'
	WHEN 'bomber-jacket-rust' THEN 'nylon'
	WHEN 'floral-pump' THEN 'satin'
	WHEN 'fringed-knit-poncho' THEN 'cotton'
	WHEN 'leather-tote-tan' THEN 'leather'
	ELSE 'mixed'
END)::"material";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "colour_family" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "material" SET NOT NULL;
