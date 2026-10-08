import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { AccountSection } from "@/components/account/account-section";
import { ProfileForm } from "@/components/account/profile-form";
import type { CurrentUser } from "@/lib/auth/session";

/** The signed-in account page: a greeting, the saved items and orders summaries, then each section. */
export function AccountOverview({ user }: { user: CurrentUser }) {
  return (
    <div className="flex flex-col gap-section">
      <header className="flex flex-col gap-3">
        <p className="eyebrow text-muted-foreground">My account</p>
        <h1 className="text-headline">Hello, {user.name}</h1>
      </header>

      <div className="grid gap-tile md:grid-cols-2">
        <Link href="/saved" className="group flex flex-col gap-3 bg-surface p-6 md:p-8">
          <span className="eyebrow flex items-center justify-between">
            Saved items
            <ArrowRightIcon aria-hidden className="size-4 transition-transform duration-200 ease-out-strong group-hover:translate-x-1" />
          </span>
          <span className="text-caption text-muted-foreground">The pieces you&apos;ve saved, on every device.</span>
        </Link>
        <section aria-labelledby="orders-heading" className="flex flex-col gap-3 bg-surface p-6 md:p-8">
          <h2 id="orders-heading" className="eyebrow">
            Orders
          </h2>
          <p className="text-caption text-muted-foreground">Your orders will appear here.</p>
        </section>
      </div>

      <div>
        <AccountSection id="profile-heading" title="Profile" description="Your name as it appears on your account and in the menu.">
          <ProfileForm name={user.name} email={user.email} />
        </AccountSection>
      </div>
    </div>
  );
}
