CREATE TYPE "public"."audience" AS ENUM('women', 'men', 'unisex');--> statement-breakpoint
-- Production is migrated but never seeded: add the column empty, fill the existing products by
-- slug (any other row becomes unisex), then make it required.
ALTER TABLE "products" ADD COLUMN "audience" "audience";--> statement-breakpoint
UPDATE "products" SET "audience" = (CASE "slug"
	WHEN 'top-handle-bag-teal' THEN 'women'
	WHEN 'double-monk-shoe' THEN 'men'
	WHEN 'round-sunglasses' THEN 'unisex'
	WHEN 'gold-hoop-earrings' THEN 'women'
	WHEN 'leather-biker-jacket' THEN 'unisex'
	WHEN 'bomber-jacket-rust' THEN 'men'
	WHEN 'floral-pump' THEN 'women'
	WHEN 'fringed-knit-poncho' THEN 'women'
	WHEN 'leather-tote-tan' THEN 'unisex'
	ELSE 'unisex'
END)::"audience";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "audience" SET NOT NULL;
