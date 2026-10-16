"use client";

import Image from "next/image";
import Link from "next/link";
import { forwardRef } from "react";

import { Media } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_QUANTITY } from "@/lib/bag/limits";
import type { BagLine as Line } from "@/lib/bag/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  line: Line;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
  onMove: () => void;
};

/**
 * One line of the bag: photo, name (linking to the product), colour and unit price, the quantity
 * (a Select: 1 up to the stock left, at most MAX_QUANTITY), the line total, and Move to
 * saved items / Remove. A line lowered to the stock left says so; a sold-out line keeps only its
 * actions and isn't counted.
 */
export const BagLine = forwardRef<HTMLButtonElement, Props>(function BagLine({ line, onQuantity, onRemove, onMove }, quantityRef) {
  const soldOut = line.note === "sold-out";
  const most = Math.max(Math.min(line.stock, MAX_QUANTITY), line.quantity);
  const id = `quantity-${line.slug}`;
  return (
    <li className="grid grid-cols-[6rem_1fr] gap-4 border-t border-border py-block md:grid-cols-[7.5rem_1fr] md:gap-6">
      <Media className={cn(soldOut && "opacity-60")}>
        {line.image && <Image src={line.image.src} alt={line.image.alt} fill sizes="(min-width: 768px) 120px, 96px" className="object-cover" />}
      </Media>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Link href={`/products/${line.slug}`} className="link-quiet text-caption uppercase">
              {line.name}
            </Link>
            <p className="text-caption text-muted-foreground">{line.colour}</p>
            <p className="text-caption">{formatPrice(line.unitPrice)}</p>
          </div>
          <p data-testid="line-total" className="shrink-0 text-caption">
            {soldOut ? "" : formatPrice(line.unitPrice * line.quantity)}
          </p>
        </div>

        {line.note === "reduced" && <p className="text-caption">Only {line.stock} left — we&apos;ve updated your bag</p>}
        {soldOut && <p className="text-caption text-muted-foreground">Sold out</p>}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {!soldOut && (
            <div className="flex items-center gap-2">
              <span id={`${id}-label`} className="eyebrow text-muted-foreground">
                Quantity
              </span>
              <Select value={line.quantity} onValueChange={(value) => value !== null && onQuantity(value)}>
                <SelectTrigger ref={quantityRef} id={id} size="sm" aria-label={`Quantity, ${line.name}`} className="min-w-12 gap-3 text-body md:text-body">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  <SelectGroup>
                    {Array.from({ length: most }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="button" variant="link" size="xs" className="px-0" onClick={onMove} aria-label={`Move to saved items: ${line.name}`}>
            Move to saved items
          </Button>
          <Button type="button" variant="link" size="xs" className="px-0" onClick={onRemove} aria-label={`Remove ${line.name}`}>
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
});
