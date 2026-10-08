"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Container } from "@/components/primitives";
import { takeAccountDeletedFlag } from "@/lib/account/deleted-flag";

/**
 * After an account is deleted, the homepage opens with `?deleted=1`: say so in a polite live
 * region, then drop the parameter so a reload or a shared link doesn't repeat it. The notice also
 * needs the session-storage flag the deletion set, so a crafted link alone can't show it. The
 * region is in the prerendered HTML and the message is added once the URL is read (under
 * <Suspense>, so this part renders only in the browser), so screen readers announce it.
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
  const [show] = useState(() => params.get("deleted") === "1" && takeAccountDeletedFlag());

  useEffect(() => {
    // Plain history (Next keeps it in sync) rather than router.replace, which would refetch the page.
    if (params.has("deleted")) window.history.replaceState(null, "", "/");
  }, [params]);

  if (!show) return null;
  return (
    <div className="bg-surface">
      <Container className="py-4 text-body">Your account has been deleted.</Container>
    </div>
  );
}
