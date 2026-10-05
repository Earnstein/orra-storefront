"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Showing 24 of 48", a progress line, and Load more while there's more to show. Focus stays on
 * the button while it loads; when the last products arrive and the button goes away, focus moves
 * to the count so it isn't lost. `announcement` is read out by a live region.
 */
export function LoadMore({
  shown,
  total,
  hasMore,
  loading,
  disabled,
  announcement,
  onLoadMore,
}: {
  shown: number;
  total: number;
  /** Whether Load more has anything left to show (it stops at MAX_PAGE). */
  hasMore: boolean;
  loading: boolean;
  /** While other results load, the counts shown are about to change. */
  disabled: boolean;
  announcement: string;
  onLoadMore: () => void;
}) {
  const countRef = useRef<HTMLParagraphElement>(null);
  const announced = announcement !== "";

  useEffect(() => {
    if (announced && !hasMore && countRef.current && document.activeElement === document.body) countRef.current.focus({ preventScroll: true });
  }, [announced, hasMore]);

  return (
    <div className="flex flex-col items-center gap-4 px-gutter pb-section">
      <p ref={countRef} tabIndex={-1} className="caption text-muted-foreground outline-none">
        Showing {shown} of {total}
      </p>
      <div className="h-px w-full max-w-60 bg-border" aria-hidden>
        <div
          className="h-px origin-left bg-foreground transition-transform duration-500 ease-out-strong motion-reduce:transition-none"
          style={{ transform: `scaleX(${total === 0 ? 0 : shown / total})` }}
        />
      </div>
      {hasMore && (
        <Button
          variant="outline"
          className="min-w-60"
          aria-busy={loading}
          disabled={disabled}
          onClick={() => {
            if (!loading) onLoadMore();
          }}
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  );
}
