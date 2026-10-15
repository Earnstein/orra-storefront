CREATE TYPE "public"."order_status" AS ENUM('pending_capture', 'paid', 'cancelled');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10001 CACHE 1;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" uuid NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"image" jsonb,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"checkout_id" uuid NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"status" "order_status" DEFAULT 'pending_capture' NOT NULL,
	"subtotal" integer NOT NULL,
	"currency" text NOT NULL,
	"shipping" jsonb,
	"payment_provider" text NOT NULL,
	"payment_reference" text NOT NULL,
	"payment_summary" text,
	"guest_key_hash" text,
	"email_attempted_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_checkoutId_unique" UNIQUE("checkout_id"),
	CONSTRAINT "orders_paymentReference_unique" UNIQUE("payment_reference"),
	CONSTRAINT "orders_subtotal_nonnegative" CHECK ("orders"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_id_index" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_created_at_index" ON "orders" USING btree ("user_id","created_at" DESC NULLS LAST);