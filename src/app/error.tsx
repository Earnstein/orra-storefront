"use client";

import { useEffect } from "react";

import { TextLink } from "@/components/primitives";
import { StatusMessage } from "@/components/site/status-message";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for every page under the root layout, so the header and footer stay. Shoppers
 * never see the error itself; it's logged for debugging (server errors carry a digest that
 * matches the server log).
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusMessage
      eyebrow="Error"
      title="Something went wrong"
      body="Please try again. If it keeps happening, come back a little later."
    >
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        <Button variant="inverse" onClick={() => retry()}>
          Try again
        </Button>
        <TextLink href="/" label>
          Back to the homepage
        </TextLink>
      </div>
    </StatusMessage>
  );
}
