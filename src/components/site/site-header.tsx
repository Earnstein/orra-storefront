import Link from "next/link";
import { UserIcon } from "lucide-react";

import { Container } from "@/components/primitives";
import { SearchButton } from "@/components/search/search-button";
import { buttonVariants } from "@/components/ui/button";
import { primaryNav, site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { BagLink } from "./bag-link";
import { MobileNav } from "./mobile-nav";

const iconLink = buttonVariants({ variant: "ghost", size: "icon" });

const accountLinks = [
  { label: "Sign in", href: "/account" },
  { label: "Find a store", href: "/stores" },
  { label: "Contact us", href: "/help/contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <Container className="grid h-header grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center">
          <div className="-ml-2.5 lg:hidden">
            <MobileNav links={primaryNav} secondary={accountLinks} />
          </div>
          <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
            {primaryNav.map((link) => (
              <Link key={link.href} href={link.href} className="eyebrow whitespace-nowrap link-quiet">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <Link href="/" className="text-title tracking-[0.35em] uppercase" aria-label={`${site.name} home`}>
          {site.name}
        </Link>

        <div className="-mr-2.5 flex items-center justify-end">
          <SearchButton />
          <Link href="/account" className={cn(iconLink, "max-sm:hidden")} aria-label="Account">
            <UserIcon />
          </Link>
          <BagLink />
        </div>
      </Container>
    </header>
  );
}
