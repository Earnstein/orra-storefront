import { Fragment } from "react";
import Link from "next/link";

import { Container, Grid } from "@/components/primitives";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Product } from "@/lib/catalog/types";
import { ListingTabs, type ListingTab } from "./listing-tabs";
import { ProductCard } from "./product-card";

export type Crumb = { label: string; href?: string };

// Tiles in the first row at the widest layout (xl: 4 columns) load their images eagerly.
const FIRST_ROW = 4;

/**
 * A product listing page: breadcrumb and heading, optional category tabs pinned under the
 * header, the item count, then the same product grid as the homepage. Shown in place of the
 * grid when there are no products: `empty`.
 */
export function ProductListing({
  breadcrumbs,
  eyebrow,
  title,
  description,
  tabs,
  sortLabel,
  products,
  empty,
}: {
  /** Trail ending with the current page (no href). */
  breadcrumbs: Crumb[];
  eyebrow?: string;
  title: string;
  description?: string;
  tabs?: ListingTab[];
  /** How the products are ordered, e.g. "Newest first". */
  sortLabel?: string;
  products: Product[];
  empty: React.ReactNode;
}) {
  const count = products.length === 1 ? "1 item" : `${products.length} items`;

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

      {products.length > 0 ? (
        <>
          <Container className="flex items-center justify-between gap-4 py-4 caption text-muted-foreground">
            <p>{count}</p>
            {sortLabel && <p>{sortLabel}</p>}
          </Container>
          <Grid layout="products" className="px-tile pb-section">
            {products.map((product, index) => (
              <ProductCard key={product.slug} product={product} eager={index < FIRST_ROW} />
            ))}
          </Grid>
        </>
      ) : (
        <Container className="flex flex-col items-start gap-6 pt-block pb-section">{empty}</Container>
      )}
    </>
  );
}
