"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Media } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";
import { MAX_QUANTITY } from "@/lib/bag/limits";
import type { BagLine } from "@/lib/bag/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AddedItem = { line: BagLine; capped: boolean; pageStock: number };

/** What to say about the stock after an add: a cap it hit, or that the bag now holds all there is. */
export function cappedMessage({ line, capped, pageStock }: AddedItem): string | null {
  if (capped && line.quantity >= MAX_QUANTITY && line.stock > MAX_QUANTITY) return "That's the most of one item per order";
  // The page's stock comes from the catalogue cache (up to 5 minutes old); the bag uses live stock.
  if (capped && line.stock < pageStock) return line.stock === 1 ? "Only 1 was left — it's in your bag" : `Only ${line.stock} were left — they're in your bag`;
  if (line.quantity >= line.stock) return line.stock === 1 ? "It's the last one, and it's in your bag" : `You have all ${line.stock} available in your bag`;
  return null;
}

/**
 * The panel that confirms an add, after Gucci's: under the header (full width on phones, 400px and
 * right-aligned from md), with the item, the quantity now in the bag, then Checkout and View bag.
 * Non-modal, so the page (and the header's updated bag count) stays usable; focus moves in, and
 * Escape, a click or focus outside, following a link or a page change closes it. Focus then goes to
 * `returnFocus()` (the control that added), unless the shopper already moved it elsewhere. No timer.
 * Built on Base UI's Dialog, already loaded for the header's sheets.
 */
export function AddedPanel({ item, onClose, returnFocus }: { item: AddedItem | null; onClose: () => void; returnFocus: () => HTMLElement | null }) {
  // Next keeps a page mounted but hidden (<Activity>) after a client navigation, and a hidden page
  // runs no effects but does clean them up: closing here means Back never finds the panel open.
  useEffect(() => () => onClose(), [onClose]);

  // The last item stays on screen while the panel fades out.
  const [shown, setShown] = useState(item);
  if (item && item !== shown) setShown(item);
  const current = item ?? shown;
  const popup = useRef<HTMLDivElement>(null);

  // Checked as the panel closes: a click or Tab that took focus elsewhere on the page keeps it there.
  function finalFocus() {
    const active = document.activeElement;
    if (active && active !== document.body && !popup.current?.contains(active)) return false;
    return returnFocus();
  }

  const line = current?.line;
  const message = current ? cappedMessage(current) : null;
  return (
    <Dialog.Root open={item !== null} onOpenChange={(open) => !open && onClose()} onOpenChangeComplete={(open) => !open && setShown(null)} modal={false}>
      <Dialog.Portal>
        <Dialog.Popup
          ref={popup}
          finalFocus={finalFocus}
          className="fixed inset-x-0 top-header z-40 flex flex-col gap-5 border-b border-border bg-background p-6 shadow-sm transition duration-200 ease-out-strong data-ending-style:-translate-y-2 data-ending-style:opacity-0 data-starting-style:-translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none md:left-auto md:right-gutter md:w-[400px] md:border-x"
        >
          <div className="flex items-center justify-between gap-4">
            {/* Capped means less than asked was added: for one more, nothing. */}
            <Dialog.Title className="eyebrow">{current?.capped ? "Already in your bag" : "Added to bag"}</Dialog.Title>
            <Dialog.Close className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label="Close">
              <XIcon />
            </Dialog.Close>
          </div>
          {line && (
            <div className="grid grid-cols-[5rem_1fr] gap-4">
              <Media>{line.image && <Image src={line.image.src} alt={line.image.alt} fill sizes="80px" className="object-cover" />}</Media>
              <div className="flex flex-col gap-1 text-caption">
                <p className="uppercase">{line.name}</p>
                <p className="text-muted-foreground">{line.colour}</p>
                <p>{formatPrice(line.unitPrice)}</p>
                <p className="text-muted-foreground">Quantity in your bag: {line.quantity}</p>
                {message && <p>{message}</p>}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <Link href="/checkout" onClick={onClose} className={cn(buttonVariants(), "w-full")}>
              Checkout
            </Link>
            <Link href="/bag" onClick={onClose} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              View bag
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
