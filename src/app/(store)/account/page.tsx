import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountOverview } from "@/components/account/account-overview";
import { Container } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { isDemoAdmin } from "@/lib/auth/permissions";
import { getCurrentSession, requireUser } from "@/lib/auth/session";
import { countOrdersForUser } from "@/lib/orders/queries";
import { countSavedItems } from "@/lib/saved/queries";

export const metadata: Metadata = {
  title: "My account",
  robots: { index: false },
};

// The shell is static; the content needs the session, so it streams under <Suspense>. Without a
// session cookie, src/proxy.ts has already sent the visitor to sign in; requireUser covers a
// cookie whose session has ended.
export default function AccountPage() {
  return (
    <Container size="content" className="py-section">
      <Suspense fallback={<AccountSkeleton />}>
        <Account />
      </Suspense>
    </Container>
  );
}

async function Account() {
  const user = await requireUser("/account");
  // The same request's session read (deduplicated): the role decides what can be changed.
  const demo = isDemoAdmin((await getCurrentSession())?.role);
  const [savedCount, orderCount] = await Promise.all([countSavedItems(user.id), countOrdersForUser(db, user.id)]);
  return <AccountOverview user={user} savedCount={savedCount} orderCount={orderCount} demo={demo} />;
}

function AccountSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-section">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24 bg-surface" />
        <Skeleton className="h-10 w-72 max-w-full bg-surface" />
      </div>
      <div className="grid gap-tile md:grid-cols-2">
        <Skeleton className="h-28 bg-surface" />
        <Skeleton className="h-28 bg-surface" />
      </div>
      <Skeleton className="h-40 bg-surface" />
    </div>
  );
}
