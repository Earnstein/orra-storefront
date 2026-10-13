CREATE TYPE "public"."checkout_status" AS ENUM('open', 'fulfilled', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "checkout_items" (
	"checkout_id" uuid NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "checkout_items_checkout_id_product_id_pk" PRIMARY KEY("checkout_id","product_id"),
	CONSTRAINT "checkout_items_quantity_positive" CHECK ("checkout_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid,
	"user_id" text,
	"email" text NOT NULL,
	"status" "checkout_status" DEFAULT 'open' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"payment_provider" text,
	"payment_reference" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkouts_paymentReference_unique" UNIQUE("payment_reference"),
	CONSTRAINT "checkouts_amount_nonnegative" CHECK ("checkouts"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "checkout_items" ADD CONSTRAINT "checkout_items_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_items" ADD CONSTRAINT "checkout_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkouts_status_expires_at_index" ON "checkouts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkouts_one_open_per_cart" ON "checkouts" USING btree ("cart_id") WHERE "checkouts"."status" = 'open';