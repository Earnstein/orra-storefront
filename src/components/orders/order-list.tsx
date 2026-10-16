import { ArrowRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Media } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { OrderListItem } from "@/lib/orders/queries";
import { orderStatusLabel } from "@/lib/orders/status";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat(site.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The account's orders, newest first: number, date, status, total and the first item photos. */
export function OrderList({ orders, total }: { orders: OrderListItem[]; total: number }) {
  return (
    <div className="flex flex-col gap-block">
      <header className="flex flex-col gap-3">
        <Link href="/account" className="eyebrow link-quiet self-start text-muted-foreground">
          My account
        </Link>
        <h1 className="text-title uppercase">Orders ({total})</h1>
        {total > orders.length && <p className="text-caption text-muted-foreground">Showing your latest {orders.length}</p>}
      </header>

      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-body">You haven&apos;t ordered anything yet.</p>
          <Link href="/collections/new" className={cn(buttonVariants())}>
            Shop new in
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col border-t border-border">
          {orders.map((order) => (
            <li key={order.number} className="border-b border-border">
              <Link
                href={`/account/orders/${order.number}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-4 py-6 md:grid-cols-[minmax(0,14rem)_1fr_auto]"
              >
                <div className="flex flex-col gap-1 text-body">
                  <span className="eyebrow">{order.number}</span>
                  <span className="text-muted-foreground">
                    {dateFormat.format(order.createdAt)} · {orderStatusLabel(order.status)}
                  </span>
                  <span>
                    {formatPrice(order.subtotal)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="col-span-2 row-start-2 flex gap-2 md:col-span-1 md:row-start-auto">
                  {order.images.map((image, index) => (
                    <Media key={index} className="w-14 shrink-0">
                      <Image src={image.src} alt="" fill sizes="56px" className="object-cover" />
                    </Media>
                  ))}
                </div>
                <ArrowRightIcon aria-hidden className="col-start-2 row-start-1 size-4 justify-self-end transition-transform duration-200 ease-out-strong group-hover:translate-x-1 md:col-start-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
