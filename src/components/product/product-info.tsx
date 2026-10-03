import Link from "next/link";

import { Cluster, Stack } from "@/components/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Product } from "@/lib/catalog/types";
import { services } from "@/lib/content";
import { formatPrice } from "@/lib/format";
import { PurchaseActions } from "./purchase-actions";
import { StockStatus } from "./stock-status";

export function ProductInfo({ product }: { product: Product }) {
  return (
    <Stack gap="block">
      <Breadcrumb>
        <BreadcrumbList className="caption">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/collections/${product.category.slug}`} />}>
              {product.category.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Stack gap="sm">
        <h1 className="text-headline">{product.name}</h1>
        <p className="text-title font-normal">{formatPrice(product.price)}</p>
      </Stack>

      <Stack gap="xs">
        <p className="caption">
          <span className="text-muted-foreground">Colour</span> {product.colour}
        </p>
        <StockStatus units={product.stock} />
      </Stack>

      <Stack gap="md">
        <PurchaseActions
          product={{
            slug: product.slug,
            name: product.name,
            price: product.price,
            stock: product.stock,
            image: product.images[0],
          }}
        />
        <Cluster gap="lg" className="gap-y-2 caption">
          <Link href="/help/contact" className="link">
            Contact an advisor
          </Link>
          <Link href={`/stores?product=${product.slug}`} className="link">
            Find in store or book an appointment
          </Link>
        </Cluster>
      </Stack>

      <Accordion multiple defaultValue={["description"]} className="border-y">
        <AccordionItem value="description">
          <AccordionTrigger className="py-4 eyebrow">Description</AccordionTrigger>
          <AccordionContent className="pb-5 text-body text-muted-foreground">
            <p>{product.description}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="details">
          <AccordionTrigger className="py-4 eyebrow">Details</AccordionTrigger>
          <AccordionContent className="pb-5">
            <dl className="flex flex-col gap-2 caption">
              {product.details.map((detail) => (
                <div key={detail.term} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{detail.term}</dt>
                  <dd className="text-right">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="delivery">
          <AccordionTrigger className="py-4 eyebrow">Delivery and returns</AccordionTrigger>
          <AccordionContent className="pb-5">
            <ul className="flex flex-col gap-2 caption text-muted-foreground">
              {services.map((service) => (
                <li key={service.title}>
                  <span className="text-foreground">{service.title}.</span> {service.body}
                </li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Stack>
  );
}
