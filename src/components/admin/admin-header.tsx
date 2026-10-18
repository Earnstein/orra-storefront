import Link from "next/link";

import { Container } from "@/components/primitives";
import type { AdminUser } from "@/lib/admin/session";
import { site } from "@/lib/site";
import { AdminNav } from "./admin-nav";
import { AdminSignOut } from "./admin-sign-out";

/** The admin's own header (the storefront's isn't shown here), and the demo admin's band. */
export function AdminHeader({ admin }: { admin: AdminUser }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <Container className="flex min-h-header flex-wrap items-center gap-x-8 gap-y-3 py-3">
        <Link href="/admin/products" className="flex items-baseline gap-3" aria-label={`${site.name} admin`}>
          <span className="text-title tracking-[0.35em] uppercase">{site.name}</span>
          <span className="eyebrow text-muted-foreground">Admin</span>
        </Link>
        <AdminNav className="order-last w-full md:order-none md:w-auto" />
        <div className="ml-auto flex items-center gap-6">
          <span className="text-caption text-muted-foreground max-md:hidden">{admin.email}</span>
          <Link href="/" className="eyebrow link-quiet">
            View store
          </Link>
          <AdminSignOut />
        </div>
      </Container>
      {admin.role === "demo-admin" && (
        <p className="bg-inverse px-gutter py-2 text-center eyebrow text-inverse-foreground">Demo admin — changes reset nightly</p>
      )}
    </header>
  );
}
