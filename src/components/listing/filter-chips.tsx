import { XIcon } from "lucide-react";

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

/** One removable chip per active filter value, then Clear all. Renders nothing without filters. */
export function FilterChips({
  filters,
  facets,
  onRemove,
  onClear,
}: {
  filters: Filters;
  facets: Results["facets"];
  onRemove: (filter: ActiveFilter) => void;
  onClear: () => void;
}) {
  const active = activeFilters(filters);
  if (active.length === 0) return null;

  return (
    <Container className="flex flex-wrap items-center gap-2 pb-4">
      {active.map((filter) => {
        const label = filterLabel(filter, facets);
        return (
          <Button
            key={`${filter.key}:${filter.value}`}
            variant="outline"
            size="xs"
            aria-label={`Remove filter: ${label}`}
            onClick={() => onRemove(filter)}
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
