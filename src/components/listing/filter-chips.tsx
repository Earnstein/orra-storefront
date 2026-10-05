"use client";

import { XIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { Container } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { activeFilters, PRICE_BANDS, type ActiveFilter, type Filters } from "@/lib/catalog/filters";
import type { Results } from "@/lib/catalog/results";

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** A chip's label: the option's own label when the results list it, else one built from the value. */
function filterLabel(filter: ActiveFilter, facets: Results["facets"]): string {
  const listed = facets[filter.key].find((option) => option.value === filter.value)?.label;
  if (listed) return listed;
  if (filter.key === "stock") return "In stock";
  if (filter.key === "newIn") return "New in";
  if (filter.key === "price") return PRICE_BANDS.find((band) => band.value === filter.value)?.label ?? filter.value;
  return capitalise(filter.value);
}

/**
 * One removable chip per active filter value, then Clear all. Renders nothing without filters.
 * Removing a chip moves focus to the chip now in its place (or the last one); removing the last
 * calls `onEmptied` so the parent can place focus.
 */
export function FilterChips({
  filters,
  facets,
  onRemove,
  onClear,
  onEmptied,
}: {
  filters: Filters;
  facets: Results["facets"];
  onRemove: (filter: ActiveFilter) => void;
  onClear: () => void;
  onEmptied: () => void;
}) {
  const active = activeFilters(filters);
  const list = useRef<HTMLDivElement>(null);
  // The index of a chip just removed, until the chips re-render without it.
  const removed = useRef<number | null>(null);
  const placeFocus = useEffectEvent(() => {
    if (removed.current === null) return;
    const chips = list.current?.querySelectorAll<HTMLButtonElement>("[data-chip]") ?? [];
    if (chips.length > 0) chips[Math.min(removed.current, chips.length - 1)].focus();
    else onEmptied();
    removed.current = null;
  });
  useEffect(() => placeFocus(), [active.length]);

  if (active.length === 0) return null;

  return (
    <Container ref={list} className="flex flex-wrap items-center gap-2 pb-4">
      {active.map((filter, index) => {
        const label = filterLabel(filter, facets);
        return (
          <Button
            key={`${filter.key}:${filter.value}`}
            variant="outline"
            size="xs"
            aria-label={`Remove filter: ${label}`}
            data-chip
            onClick={() => {
              removed.current = index;
              onRemove(filter);
            }}
          >
            {label}
            <XIcon data-icon="inline-end" aria-hidden />
          </Button>
        );
      })}
      <Button variant="link" size="xs" className="ml-2" onClick={onClear}>
        Clear all
      </Button>
    </Container>
  );
}
