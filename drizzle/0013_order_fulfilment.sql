ALTER TYPE "public"."order_status" ADD VALUE 'fulfilled';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "orders_created_at_index" ON "orders" USING btree ("created_at" DESC NULLS LAST);