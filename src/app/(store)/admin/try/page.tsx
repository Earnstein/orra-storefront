import type { Metadata } from "next";
import Link from "next/link";

import { TryAdminButton } from "@/components/admin/try-admin-button";
import { Container } from "@/components/primitives";
import { signInPath } from "@/lib/auth/return-to";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Try the admin",
  description: `Run ${site.name} from the browser as a shared demo admin.`,
  robots: { index: false },
};

// Static, in the storefront's frame (outside the admin layout, which needs an admin). The button
// posts to /api/demo-admin; src/proxy.ts lets this page through without a session and sends a
// signed-out visitor at /admin here.
export default function TryAdminPage() {
  return (
    <Container size="prose" className="flex flex-col gap-block py-section">
      <header className="flex flex-col gap-3">
        <p className="eyebrow text-muted-foreground">Admin demo</p>
        <h1 className="text-title uppercase">Try the admin</h1>
        <p className="text-body">
          See how {site.name} is run. Start the demo to sign in as a shared demo admin, then change the catalogue and see it on the store straight away.
        </p>
      </header>
      <section aria-labelledby="demo-can" className="flex flex-col gap-3">
        <h2 id="demo-can" className="eyebrow">
          In the demo you can
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
          <li>Add products, edit their names, prices, stock and photos, and archive them.</li>
          <li>Look through orders, with customers&apos; names, emails and addresses hidden.</li>
        </ul>
      </section>
      <section aria-labelledby="demo-know" className="flex flex-col gap-3">
        <h2 id="demo-know" className="eyebrow">
          Good to know
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
          <li>Everyone trying the demo shares it, and every change resets nightly.</li>
          <li>Orders can&apos;t be fulfilled or cancelled, and the demo can&apos;t see or change accounts.</li>
          <li>Starting it signs you out of your own account. It lasts 2 hours.</li>
        </ul>
      </section>
      <TryAdminButton />
      <p className="border-t pt-block text-caption text-muted-foreground">
        Run this store?{" "}
        <Link href={signInPath("/admin")} className="link">
          Sign in to the admin
        </Link>
      </p>
    </Container>
  );
}
