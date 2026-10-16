import Image from "next/image";

import type { OrderShipping } from "@/db/schema/orders";
import type { ProductImage } from "@/db/schema/catalog";
import { Media } from "@/components/primitives";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/format";

// The parts of an order every order page shows: the success page (a client component), the
// account's order and a guest's order link. No hooks, so both server and client can render them.

export type OrderLines = {
  items: { name: string; unitPrice: number; quantity: number; image: ProductImage | null }[];
  subtotal: number;
};

/** Delivering to, estimated delivery and payment, as a definition list. */
export function OrderFacts({ shipping, delivery, paymentSummary }: { shipping: OrderShipping | null; delivery: string | null; paymentSummary: string | null }) {
  return (
    <dl className="grid gap-block text-body sm:grid-cols-2">
      {shipping && (
        <div className="flex flex-col gap-2">
          <dt className="eyebrow">Delivering to</dt>
          <dd>
            <address className="not-italic">
              {shipping.name}
              <br />
              {shipping.line1}
              {shipping.line2 && (
                <>
                  <br />
                  {shipping.line2}
                </>
              )}
              <br />
              {shipping.city}, {shipping.state} {shipping.postalCode}
              <br />
              {shipping.country === "US" ? "United States" : shipping.country}
            </address>
          </dd>
        </div>
      )}
      {delivery && (
        <div className="flex flex-col gap-2">
          <dt className="eyebrow">Estimated delivery</dt>
          <dd>
            {delivery}
            <br />
            <span className="text-muted-foreground">Complimentary delivery</span>
          </dd>
        </div>
      )}
      {paymentSummary && (
        <div className="flex flex-col gap-2">
          <dt className="eyebrow">Payment</dt>
          <dd>{paymentSummary}</dd>
        </div>
      )}
    </dl>
  );
}

/** The items with their photos, then subtotal, delivery and total, on the surface band. */
export function OrderSummary({ order }: { order: OrderLines }) {
  return (
    <section aria-labelledby="order-summary-heading" className="flex flex-col gap-5 bg-surface p-6">
      <h2 id="order-summary-heading" className="eyebrow">
        Order summary
      </h2>
      <ul className="flex flex-col gap-4">
        {order.items.map((item, index) => (
          <li key={index} className="grid grid-cols-[4rem_1fr_auto] gap-4 text-caption">
            <Media>{item.image && <Image src={item.image.src} alt={item.image.alt} fill sizes="64px" className="object-cover" />}</Media>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="uppercase">{item.name}</p>
              <p className="text-muted-foreground">Quantity: {item.quantity}</p>
            </div>
            <p>{formatPrice(item.unitPrice * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <Separator />
      <dl className="flex flex-col gap-3 text-body">
        <div className="flex justify-between gap-4">
          <dt>Subtotal</dt>
          <dd>{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Delivery</dt>
          <dd>Complimentary</dd>
        </div>
      </dl>
      <Separator />
      <div className="flex justify-between gap-4 text-body uppercase">
        <span>Total</span>
        <span>{formatPrice(order.subtotal)}</span>
      </div>
    </section>
  );
}
