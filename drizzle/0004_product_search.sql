-- Search index for M3. Production is migrated but never re-seeded, so the backfill below fills
-- existing products. Both columns are maintained by triggers: a generated column can't read the
-- category's name.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search" "tsvector" DEFAULT ''::tsvector NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE FUNCTION "products_search_refresh"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	category_name text;
	detail_values text;
BEGIN
	SELECT "name" INTO category_name FROM "categories" WHERE "id" = NEW."category_id";
	SELECT coalesce(string_agg(detail ->> 'value', ' '), '') INTO detail_values
		FROM jsonb_array_elements(NEW."details") AS detail;
	NEW."search" :=
		setweight(to_tsvector('english', NEW."name"), 'A') ||
		setweight(to_tsvector('english', concat_ws(' ', NEW."colour", NEW."colour_family"::text, NEW."material"::text, category_name)), 'B') ||
		setweight(to_tsvector('english', concat_ws(' ', NEW."description", detail_values)), 'C');
	NEW."search_text" := lower(concat_ws(' ', NEW."name", NEW."colour", NEW."colour_family"::text, NEW."material"::text, category_name));
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "products_search_refresh" BEFORE INSERT OR UPDATE ON "products"
	FOR EACH ROW EXECUTE FUNCTION "products_search_refresh"();--> statement-breakpoint
-- Renaming a category re-saves its products, which fires the trigger above.
CREATE FUNCTION "categories_search_refresh"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	UPDATE "products" SET "category_id" = "category_id" WHERE "category_id" = NEW."id";
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "categories_search_refresh" AFTER UPDATE OF "name" ON "categories"
	FOR EACH ROW EXECUTE FUNCTION "categories_search_refresh"();--> statement-breakpoint
UPDATE "products" SET "category_id" = "category_id";--> statement-breakpoint
CREATE INDEX "products_search_idx" ON "products" USING gin ("search");--> statement-breakpoint
CREATE INDEX "products_search_text_trgm_idx" ON "products" USING gin ("search_text" gin_trgm_ops);
