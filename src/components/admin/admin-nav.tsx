"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  { label: "Products", href: "/admin/products" },
  { label: "Orders", href: "/admin/orders" },
];

/** Products and Orders; the current section is underlined and marked for assistive tech. */
export function AdminNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className={cn("flex items-center gap-6", className)}>
      {links.map((link) => {
        const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined} className={cn("eyebrow", current ? "link" : "link-quiet")}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
