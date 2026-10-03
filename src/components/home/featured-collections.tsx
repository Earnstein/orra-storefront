import Image from "next/image";
import Link from "next/link";

import { Container, Media, Section } from "@/components/primitives";
import { featuredCollections } from "@/lib/catalog/sample-data";
import { cn } from "@/lib/utils";

/** Asymmetric collection grid: one tall image beside two stacked wide ones from md up. */
export function FeaturedCollections() {
  return (
    <Section spacing="none" aria-labelledby="collections-heading">
      <Container className="pb-block">
        <h2 id="collections-heading" className="text-headline">
          Shop the collections
        </h2>
      </Container>

      <div className="grid gap-tile md:grid-cols-2 md:grid-rows-2">
        {featuredCollections.map((collection, index) => {
          const tall = index === 0;
          return (
            <Link
              key={collection.slug}
              href={`/collections/${collection.slug}`}
              className={cn("group relative block", tall && "md:row-span-2")}
            >
              <Media ratio={tall ? "portrait" : "landscape"} className={cn(tall && "md:aspect-auto md:h-full")}>
                <Image
                  src={collection.image.src}
                  alt={collection.image.alt}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                />
              </Media>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-linear-to-t from-scrim/50 to-transparent px-gutter pt-16 pb-6 text-on-image">
                <h3 className="text-title">{collection.name}</h3>
                <span className="eyebrow link-quiet group-hover:decoration-current">Shop now</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
