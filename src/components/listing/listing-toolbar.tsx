import { Container } from "@/components/primitives";
import { Button } from "@/components/ui/button";

export type SheetSection = "sort" | "filters";

/**
 * "48 items sorted by Newest", and the Filter and sort button with the active filter count. The
 * count is a live region, so a change of results is announced. Without `onOpen` (no sheet yet)
 * both controls are inert.
 */
export function ListingToolbar({
  total,
  sortLabel,
  activeCount,
  filterButtonRef,
  onOpen,
}: {
  total: number;
  sortLabel: string;
  activeCount: number;
  /** Where focus goes after filters are cleared. */
  filterButtonRef?: React.Ref<HTMLButtonElement>;
  onOpen?: (section: SheetSection) => void;
}) {
  return (
    <Container className="flex items-center justify-between gap-4 py-4 caption text-muted-foreground">
      <p aria-live="polite">
        {total === 1 ? "1 item" : `${total} items`} sorted by{" "}
        <button
          type="button"
          className="text-foreground link-quiet disabled:no-underline"
          disabled={!onOpen}
          onClick={() => onOpen?.("sort")}
        >
          {sortLabel}
        </button>
      </p>
      <Button
        ref={filterButtonRef}
        variant="link"
        size="sm"
        className="text-foreground"
        disabled={!onOpen}
        onClick={() => onOpen?.("filters")}
      >
        Filter and sort{activeCount > 0 && ` (${activeCount})`}
      </Button>
    </Container>
  );
}
