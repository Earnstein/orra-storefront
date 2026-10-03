"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

import { Container } from "@/components/primitives";
import { cn } from "@/lib/utils";

export type ListingTab = { label: string; href: string; current: boolean };

/**
 * Category tabs for a listing, pinned under the header. On narrow screens the row scrolls
 * sideways, so the current tab is scrolled into view on load.
 */
export function ListingTabs({ tabs, label }: { tabs: ListingTab[]; label: string }) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    // Centre it without scrolling the page vertically (scrollIntoView would).
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, []);

  return (
    <div className="sticky top-header z-30 border-y bg-background">
      <Container>
        <nav
          ref={navRef}
          aria-label={label}
          className="-mx-gutter flex h-12 gap-6 overflow-x-auto px-gutter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center eyebrow decoration-1 underline-offset-[6px] transition-colors duration-200",
                tab.current ? "text-foreground underline" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </Container>
    </div>
  );
}
