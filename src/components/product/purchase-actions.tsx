"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { CheckIcon, HeartIcon, ShoppingBagIcon, TruckIcon } from "lucide-react";

import { Container } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { useBag } from "@/lib/bag/use-bag";
import { useSaved } from "@/lib/saved/use-saved";
import { deliveryWindow } from "@/lib/catalog/delivery";
import type { CatalogImage } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

type PurchasableProduct = {
  slug: string;
  name: string;
  price: number;
  stock: number;
  image: CatalogImage;
};

const CONFIRM_MS = 2000;

const dateFormat = new Intl.DateTimeFormat(site.locale, { weekday: "short", day: "numeric", month: "short" });

const noopSubscribe = () => () => {};
/** True only after hydration, for values that depend on the visitor's clock. */
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Add to bag (primary) and Save for later (secondary), with the delivery estimate under
 * them, following the luxury PDP pattern. A compact bar repeats Add to bag once the main
 * button scrolls out of view.
 */
export function PurchaseActions({ product }: { product: PurchasableProduct }) {
  // No bag read on load (a request per product view); each add's answer says what's in the bag.
  const bag = useBag({ load: false });
  const [inBag, setInBag] = useState(0);
  const [allInBag, setAllInBag] = useState(false);
  const [adding, setAdding] = useState(false);
  const [soldOutSince, setSoldOutSince] = useState(false);
  const savedItems = useSaved();
  const hydrated = useHydrated();
  const [justAdded, setJustAdded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [showBar, setShowBar] = useState(false);
  const addButtonRef = useRef<HTMLDivElement>(null);

  const saved = savedItems.isSaved(product.slug);
  const soldOut = product.stock <= 0 || soldOutSince;

  useEffect(() => {
    if (!justAdded) return;
    const timeout = window.setTimeout(() => setJustAdded(false), CONFIRM_MS);
    return () => window.clearTimeout(timeout);
  }, [justAdded]);

  // Show the compact bar once the main Add to bag button has scrolled up behind the sticky header.
  useEffect(() => {
    const element = addButtonRef.current;
    if (!element) return;
    const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const observer = new IntersectionObserver(
      ([entry]) => setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < headerHeight),
      { rootMargin: `-${Math.round(headerHeight)}px 0px 0px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  async function add() {
    if (adding) return;
    setAdding(true);
    try {
      const { bag: next, capped } = await bag.add(product.slug);
      const line = next.lines.find((l) => l.slug === product.slug);
      setInBag(line?.quantity ?? 0);
      // The server caps at live stock, which may be lower than this (cached) page says.
      if (!line) setSoldOutSince(true);
      setAllInBag(line ? capped || line.quantity >= line.stock : false);
      if (!capped) {
        setJustAdded(true);
        setAnnouncement(`${product.name} added to your bag.`);
      } else {
        setAnnouncement(line ? `All available ${product.name} are in your bag.` : `${product.name} is sold out.`);
      }
    } catch {
      setAnnouncement(`${product.name} couldn't be added. Try again.`);
    } finally {
      setAdding(false);
    }
  }

  function toggleSave() {
    savedItems.toggle(product.slug);
    setAnnouncement(saved ? `${product.name} removed from saved items.` : `${product.name} saved for later.`);
  }

  const addLabel = soldOut ? "Sold out" : allInBag ? "All available in your bag" : adding ? "Adding…" : justAdded ? "Added to bag" : "Add to bag";
  const addIcon = justAdded ? <CheckIcon data-icon="inline-start" /> : <ShoppingBagIcon data-icon="inline-start" />;
  const compactLabel = soldOut ? "Sold out" : allInBag ? "In your bag" : adding ? "Adding…" : justAdded ? "Added" : "Add to bag";
  const delivery = hydrated ? deliveryWindow(new Date()) : null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div ref={addButtonRef}>
          <Button className="w-full" onClick={add} disabled={soldOut || allInBag}>
            {!soldOut && !allInBag && addIcon}
            {addLabel}
          </Button>
        </div>
        <Button variant="outline" className="w-full" onClick={toggleSave} aria-pressed={saved}>
          <HeartIcon data-icon="inline-start" className={cn(saved && "fill-current")} />
          {saved ? "Saved" : "Save for later"}
        </Button>

        {!soldOut && (
          <p className="flex items-start gap-2 pt-1 caption text-muted-foreground">
            <TruckIcon aria-hidden className="mt-px size-4 shrink-0 stroke-[1.5]" />
            {/* Dates depend on the visitor's clock, so they render after hydration. */}
            <span>
              Complimentary delivery
              {delivery && (
                <>
                  , estimated{" "}
                  <span className="text-foreground">
                    {dateFormat.format(delivery.earliest)} – {dateFormat.format(delivery.latest)}
                  </span>
                </>
              )}
            </span>
          </p>
        )}
        {inBag > 0 && !justAdded && (
          <p className="caption text-muted-foreground">
            {inBag === 1 ? "1 in your bag" : `${inBag} in your bag`}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>

      {/* Compact bar, repeated here so Add to bag stays one tap away while browsing images and details. */}
      <div
        inert={!showBar}
        aria-hidden={!showBar}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t bg-background transition-transform duration-300 ease-out-strong motion-reduce:transition-none",
          showBar ? "translate-y-0" : "translate-y-full",
        )}
      >
        <Container className="flex items-center gap-4 py-3">
          <div className="relative h-12 w-10 shrink-0 overflow-hidden bg-surface">
            <Image src={product.image.src} alt="" fill sizes="40px" className="object-cover" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col caption">
            <p className="truncate">{product.name}</p>
            <p className="text-muted-foreground">{formatPrice(product.price)}</p>
          </div>
          <Button size="sm" onClick={add} disabled={soldOut || allInBag} className="shrink-0">
            {!soldOut && !allInBag && addIcon}
            {compactLabel}
          </Button>
        </Container>
      </div>
    </>
  );
}
