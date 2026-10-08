"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Grid } from "@/components/primitives";
import { ProductCard } from "@/components/product/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signInPath } from "@/lib/auth/return-to";
import type { ProductSummary } from "@/lib/catalog/types";
import { useSaved } from "@/lib/saved/use-saved";
import { cn } from "@/lib/utils";

const FIRST_ROW = 4;

/** Card data for `slugs` from the public, cacheable summaries endpoint (sorted, so equal lists share a cache entry). */
async function fetchSummaries(slugs: string[]): Promise<ProductSummary[]> {
  const query = new URLSearchParams(slugs.map((slug) => ["slug", slug]));
  const response = await fetch(`/api/products/summaries?${query}`);
  if (!response.ok) throw new Error(`summaries: ${response.status}`);
  return ((await response.json()) as { products: ProductSummary[] }).products;
}

/**
 * /saved: "Saved items (n)", then the grid with a remove control on each card. Signed out it shows
 * this browser's list with a prompt to sign in; signed in, the account's. Products that no longer
 * exist are left out (and not counted).
 */
export function SavedView() {
  const saved = useSaved();
  const [announcement, setAnnouncement] = useState("");
  const sorted = [...saved.slugs].sort();

  const cards = useQuery({
    queryKey: ["summaries", sorted],
    queryFn: () => fetchSummaries(sorted),
    enabled: saved.status !== "loading" && sorted.length > 0,
    placeholderData: keepPreviousData,
  });

  const failed = saved.failed || cards.isError;
  const loading = !failed && (saved.status === "loading" || (sorted.length > 0 && cards.isPending));
  const heading = useRef<HTMLHeadingElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const bySlug = new Map((cards.data ?? []).map((product) => [product.slug, product]));
  const products = saved.slugs.flatMap((slug) => bySlug.get(slug) ?? []);

  function remove(product: ProductSummary, index: number) {
    saved.toggle(product.slug);
    setAnnouncement(`${product.name} removed from saved items.`);
    // The focused button goes with its card: move to the next card's Remove (now at this index),
    // else the previous one, else the heading.
    requestAnimationFrame(() => {
      const buttons = grid.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]") ?? [];
      (buttons[index] ?? buttons[index - 1] ?? heading.current)?.focus();
    });
  }

  return (
    <div className="flex flex-col gap-block">
      <h1 ref={heading} tabIndex={-1} className="text-title uppercase outline-none">
        {loading || failed ? "Saved items" : `Saved items (${products.length})`}
      </h1>

      {saved.status === "local" && (
        <div className="flex flex-col gap-3 bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body">Sign in to keep your saved items on every device</p>
          <Link href={signInPath("/saved")} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start sm:self-auto")}>
            Sign in
          </Link>
        </div>
      )}

      {failed ? (
        <div className="flex flex-col items-start gap-4 py-block">
          <p role="alert" className="text-body">
            We couldn&apos;t load your saved items.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (saved.failed) saved.retry();
              if (cards.isError) void cards.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : loading ? (
        <Grid layout="products" aria-hidden>
          {Array.from({ length: FIRST_ROW }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/5] bg-surface" />
          ))}
        </Grid>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-start gap-4 py-block">
          <p className="text-body">You haven&apos;t saved anything yet</p>
          <Link href="/collections/new" className={cn(buttonVariants({ variant: "outline" }))}>
            New in
          </Link>
        </div>
      ) : (
        <Grid ref={grid} layout="products" role="list">
          {products.map((product, index) => (
            <div key={product.slug} role="listitem" className="relative">
              <ProductCard product={product} eager={index < FIRST_ROW} />
              <Button
                type="button"
                variant="inverse"
                size="icon-sm"
                className="absolute top-2 right-2"
                data-remove
                aria-label={`Remove ${product.name} from saved items`}
                onClick={() => remove(product, index)}
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </Grid>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
