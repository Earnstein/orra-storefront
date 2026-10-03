"use client";

import { useState } from "react";
import Image from "next/image";

import type { CatalogImage } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

/**
 * One list of images, two layouts (following Gucci):
 * - below lg: a full-width swipeable strip (native scroll-snap) with a counter on the image
 *   and a progress line beneath it;
 * - lg and up: the same images stacked as layers in a square main frame, chosen from a
 *   thumbnail row beneath. The frame is sized so it and the thumbnails fit the viewport.
 */
export function ProductGallery({ images, name }: { images: CatalogImage[]; name: string }) {
  const [active, setActive] = useState(0);
  const count = images.length;

  return (
    <div className="flex flex-col gap-tile">
      <div className="relative">
        <ul
          aria-label={`${name}, image ${active + 1} of ${count}`}
          onScroll={(event) => {
            const el = event.currentTarget;
            if (el.clientWidth) setActive(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className={cn(
            "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            // Desktop frame: square, height-limited so the thumbnails stay on screen, never wider than ~half the viewport.
            "lg:relative lg:block lg:size-[min(calc(100svh-var(--spacing-header)-2*var(--spacing-block)-6.25rem-var(--spacing-tile)),48vw)] lg:overflow-hidden lg:bg-surface",
          )}
        >
          {images.map((image, index) => (
            <li
              key={image.src}
              aria-hidden={index !== active}
              className={cn(
                "relative aspect-[4/5] w-full shrink-0 snap-start bg-surface",
                // Desktop: layers in the frame; only the active one is visible.
                "lg:absolute lg:inset-0 lg:aspect-auto lg:transition-opacity lg:duration-200 lg:ease-out motion-reduce:transition-none",
                index === active ? "lg:opacity-100" : "lg:opacity-0",
              )}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-cover"
                // The first image is the LCP; the rest load straight after so swaps never wait.
                loading="eager"
                fetchPriority={index === 0 ? "high" : "low"}
              />
            </li>
          ))}
        </ul>

        {count > 1 && (
          <p aria-hidden className="absolute right-3 bottom-3 bg-background/85 px-2 py-0.5 caption lg:hidden">
            {active + 1} / {count}
          </p>
        )}
      </div>

      {count > 1 && (
        <>
          {/* Mobile: thin progress line, one segment per image. */}
          <div aria-hidden className="relative h-px bg-border lg:hidden">
            <span
              className="absolute inset-y-0 left-0 bg-foreground transition-transform duration-200 ease-out motion-reduce:transition-none"
              style={{ width: `${100 / count}%`, transform: `translateX(${active * 100}%)` }}
            />
          </div>

          {/* Desktop: thumbnails choose the main image. */}
          <div
            role="group"
            aria-label="Choose an image"
            className="hidden gap-tile lg:flex"
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = (active + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
              setActive(next);
              event.currentTarget.querySelectorAll("button")[next]?.focus();
            }}
          >
            {images.map((image, index) => (
              <button
                key={image.src}
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Show image ${index + 1} of ${count}: ${image.alt}`}
                aria-current={index === active}
                tabIndex={index === active ? 0 : -1}
                className={cn(
                  "relative aspect-[4/5] w-20 shrink-0 overflow-hidden bg-surface outline-offset-2 transition-opacity duration-200",
                  "after:pointer-events-none after:absolute after:inset-0 after:border after:transition-colors",
                  index === active
                    ? "after:border-border-strong"
                    : "opacity-60 after:border-transparent hover:opacity-100",
                )}
              >
                <Image src={image.src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
