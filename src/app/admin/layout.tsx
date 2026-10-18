import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminPageSkeleton } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/admin/session";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · Admin | ${site.name}` },
  robots: { index: false },
};

/**
 * The admin area: its own header instead of the storefront's, shown once requireAdmin has checked
 * the session (uncached) and the role. Visitors without a session cookie were already sent to sign
 * in by src/proxy.ts, and anyone without an admin role gets the not-found page.
 *
 * This check is for the header only, NOT a gate for the pages: Next renders a route's segments in
 * parallel, so a page's output is produced whatever its layout does. Every page renders its
 * content inside a component that awaited requireAdmin itself, and every admin action and route
 * calls requireAdmin or adminCheck first.
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
    <>
      <div aria-hidden className="h-header border-b" />
      {/* The skip link's target exists while the check runs. */}
      <main id="main" className="flex-1">
        <AdminPageSkeleton />
      </main>
    </>
  );
}
