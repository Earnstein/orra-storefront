import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { Container } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/admin/session";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · Admin | ${site.name}` },
  robots: { index: false },
};

/**
 * The admin area: its own header instead of the storefront's. Nothing below renders until
 * requireAdmin has checked the session (uncached) and the role: visitors without a session cookie
 * were already sent to sign in by src/proxy.ts, and anyone without an admin role gets the
 * not-found page. Each page and every admin action and route checks again for itself.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <>
      <AdminHeader admin={admin} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}

function AdminSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-header border-b" />
      <Container className="flex flex-col gap-block py-section">
        <Skeleton className="h-10 w-48 bg-surface" />
        <Skeleton className="h-64 bg-surface" />
      </Container>
    </div>
  );
}
