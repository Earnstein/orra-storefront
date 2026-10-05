import { Fragment } from "react";
import Link from "next/link";

import { Container } from "@/components/primitives";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ListingTabs, type ListingTab } from "./listing-tabs";

export type Crumb = { label: string; href?: string };

/**
 * A product listing page: breadcrumb and heading, optional category tabs pinned under the
 * header, then `children` (the results: toolbar, grid and Load more).
 */
export function ProductListing({
  breadcrumbs,
  eyebrow,
  title,
  description,
  tabs,
  children,
}: {
  /** Trail ending with the current page (no href). */
  breadcrumbs: Crumb[];
  eyebrow?: string;
  title: string;
  description?: string;
  tabs?: ListingTab[];
  children: React.ReactNode;
}) {
  return (
    <>
      <Container className="flex flex-col gap-block py-block">
        <Breadcrumb>
          <BreadcrumbList className="caption">
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={crumb.label}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex max-w-prose flex-col gap-3">
          {eyebrow && <p className="eyebrow text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-headline">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      </Container>

      {tabs && tabs.length > 1 && <ListingTabs tabs={tabs} label="Categories" />}

      {children}
    </>
  );
}
