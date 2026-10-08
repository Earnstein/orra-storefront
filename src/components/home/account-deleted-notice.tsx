"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Container } from "@/components/primitives";

/**
 * After an account is deleted, the homepage opens with `?deleted=1`: say so in a polite live
 * region, then drop the parameter so a reload or a shared link doesn't repeat it. The region is
 * in the prerendered HTML and the message is added to it once the URL is read (under <Suspense>,
 * since the homepage is static), so screen readers announce it.
 */
export function AccountDeletedNotice() {
  return (
    <div role="status">
      <Suspense fallback={null}>
        <Notice />
      </Suspense>
    </div>
  );
}

function Notice() {
  const params = useSearchParams();
  const router = useRouter();
  const [show] = useState(() => params.get("deleted") === "1");

  useEffect(() => {
    if (params.has("deleted")) router.replace("/", { scroll: false });
  }, [params, router]);

  if (!show) return null;
  return (
    <div className="bg-surface">
      <Container className="py-4 text-body">Your account has been deleted.</Container>
    </div>
  );
}
