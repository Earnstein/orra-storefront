import Image from "next/image";
import Link from "next/link";

import { Container, Media, Section, Stack } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getSpotlightProduct } from "@/lib/catalog/queries";
import { formatPrice } from "@/lib/format";

/** One product, given room: large image and the details that matter to buy it. */
export async function ProductSpotlight() {
  const spotlight = await getSpotlightProduct();
  const [image] = spotlight.images;

  return (
    <Section aria-labelledby="spotlight-heading">
      <Container className="grid items-center gap-block md:grid-cols-2">
        <Media ratio="square">
          <Image src={image.src} alt={image.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </Media>

        <Stack gap="lg" className="md:px-block">
          <Stack gap="sm">
            <h2 id="spotlight-heading" className="text-headline">
              {spotlight.name}
            </h2>
            <p>{formatPrice(spotlight.price)}</p>
          </Stack>
          <p className="max-w-prose text-muted-foreground">{spotlight.description}</p>

          <dl className="flex flex-col">
            {spotlight.details.map((detail) => (
              <div key={detail.term} className="flex flex-col">
                <Separator />
                <div className="flex justify-between gap-4 py-3 caption">
                  <dt className="text-muted-foreground">{detail.term}</dt>
                  <dd>{detail.value}</dd>
                </div>
              </div>
            ))}
            <Separator />
          </dl>

          <Link href={`/products/${spotlight.slug}`} className={buttonVariants({ className: "w-full sm:w-auto sm:self-start" })}>
            View the bag
          </Link>
        </Stack>
      </Container>
    </Section>
  );
}
