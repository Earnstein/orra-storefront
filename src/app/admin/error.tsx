"use client";

import { useEffect } from "react";

import { TextLink } from "@/components/primitives";
import { StatusMessage } from "@/components/site/status-message";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for admin pages (inside the admin layout, so its header stays). A role missing
 * the page's permission (requireAdmin's AdminPermissionError) lands here too; production hides
 * which it was, so the copy covers both.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusMessage
      eyebrow="Admin"
      title="This page couldn't be shown"
      body="Your account may not have access to it, or something went wrong. Try again, or go back to products."
    >
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
        <Button variant="inverse" onClick={() => retry()}>
          Try again
        </Button>
        <TextLink href="/admin/products" label>
          Back to products
        </TextLink>
      </div>
    </StatusMessage>
  );
}
