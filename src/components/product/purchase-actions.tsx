"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { CheckIcon, HeartIcon, ShoppingBagIcon, TruckIcon } from "lucide-react";

import { Container } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { AddedPanel, type AddedItem } from "@/components/bag/added-panel";
import { MAX_QUANTITY } from "@/lib/bag/limits";
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
  const [atLimit, setAtLimit] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedItem | null>(null);
  // Where focus goes when the added-to-bag panel closes: the button that added, or Save for later
  // when the bag now holds all there is (Add to bag is disabled then).
  const returnFocus = useRef<HTMLElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
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

  async function add(event: React.MouseEvent<HTMLButtonElement>) {
    const clicked = event.currentTarget;
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const { bag: next, capped } = await bag.add(product.slug);
      const line = next.lines.find((l) => l.slug === product.slug);
      // The server caps at live stock, which may be lower than this (cached) page says.
      if (!line || line.note === "sold-out") {
        setSoldOutSince(true);
        setInBag(0);
        setAnnouncement(`${product.name} is sold out.`);
        return;
      }
      setInBag(line.quantity);
      const limit = line.quantity >= MAX_QUANTITY && line.stock > MAX_QUANTITY;
      const all = !limit && line.quantity >= line.stock;
      setAtLimit(limit);
      setAllInBag(all);
      returnFocus.current = limit || all ? saveButtonRef.current : clicked;
      setAdded({ line, capped, pageStock: product.stock });
      if (!capped) {
        setJustAdded(true);
        setAnnouncement(`${product.name} added to your bag.`);
      } else {
        setAnnouncement(limit ? `You have the most of ${product.name} one order can take.` : `All available ${product.name} are in your bag.`);
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Something went wrong. Try again.";
      setAddError(message);
      setAnnouncement(`${product.name} couldn't be added. ${message}`);
    } finally {
      setAdding(false);
    }
  }

  const closePanel = useCallback(() => setAdded(null), []);
  // The compact bar may have slid away (inert) since its button was clicked: fall back to the main
  // Add to bag, or Save for later when that's disabled.
  const panelReturnFocus = useCallback((): HTMLElement | null => {
    const target = returnFocus.current;
    if (target && !target.closest("[inert]") && !(target instanceof HTMLButtonElement && target.disabled)) return target;
    return addButtonRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? saveButtonRef.current;
  }, []);

  function toggleSave() {
    savedItems.toggle(product.slug);
    setAnnouncement(saved ? `${product.name} removed from saved items.` : `${product.name} saved for later.`);
  }

  const full = allInBag || atLimit;
  const addLabel = soldOut ? "Sold out" : allInBag ? "All available in your bag" : atLimit ? `${MAX_QUANTITY} in your bag (the most per order)` : adding ? "Adding…" : justAdded ? "Added to bag" : "Add to bag";
  const addIcon = justAdded ? <CheckIcon data-icon="inline-start" /> : <ShoppingBagIcon data-icon="inline-start" />;
  const compactLabel = soldOut ? "Sold out" : full ? "In your bag" : adding ? "Adding…" : justAdded ? "Added" : "Add to bag";
  const delivery = hydrated ? deliveryWindow(new Date()) : null;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div ref={addButtonRef}>
          <Button className="w-full" onClick={add} disabled={soldOut || full}>
            {!soldOut && !full && addIcon}
            {addLabel}
          </Button>
        </div>
        <Button ref={saveButtonRef} variant="outline" className="w-full" onClick={toggleSave} aria-pressed={saved}>
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
        {addError && (
          <p role="alert" className="caption text-destructive">
            {addError}
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
          <Button size="sm" onClick={add} disabled={soldOut || full} className="shrink-0">
            {!soldOut && !full && addIcon}
            {compactLabel}
          </Button>
        </Container>
      </div>

      <AddedPanel item={added} onClose={closePanel} returnFocus={panelReturnFocus} />
    </>
  );
}
