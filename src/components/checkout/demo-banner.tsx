"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

const TEST_CARD = "4242 4242 4242 4242";

/** The demo store's note: which test card to use, with a Copy button (no real money moves). */
export function DemoBanner() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-surface px-4 py-3 text-caption">
      <p>
        Demo store — pay with the test card <span className="whitespace-nowrap tabular-nums">{TEST_CARD}</span>, any future date, any CVC
      </p>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="px-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(TEST_CARD.replaceAll(" ", ""));
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        Copy card number
      </Button>
      <p role="status" className="sr-only">
        {copied ? "Test card number copied" : ""}
      </p>
    </div>
  );
}
