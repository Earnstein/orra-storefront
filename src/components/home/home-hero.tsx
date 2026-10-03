import Image from "next/image";
import Link from "next/link";

import { Cluster, Container } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";
import { hero } from "@/lib/catalog/sample-data";
import { cn } from "@/lib/utils";

/**
 * Full-bleed campaign: one image on phones, a diptych from md up, filling the
 * viewport below the header. The headline sits over a bottom scrim.
 */
export function HomeHero() {
  const [primary, secondary] = hero.actions;

  return (
    <section className="relative grid h-[calc(100svh-var(--spacing-header))] max-h-[60rem] min-h-[34rem] md:grid-cols-2">
      {hero.images.map((image, index) => (
        <div key={image.src} className={cn("relative bg-surface", index > 0 && "max-md:hidden")}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
            loading="eager"
            fetchPriority={index === 0 ? "high" : "auto"}
          />
        </div>
      ))}

      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-scrim/60 via-scrim/10 to-transparent" />

      <Container className="absolute inset-x-0 bottom-0 flex flex-col gap-6 pb-block text-on-image">
        <h1 className="max-w-[12ch] text-display">{hero.title}</h1>
        <p className="max-w-[40ch] text-title font-normal">{hero.body}</p>
        <Cluster gap="lg">
          <Link href={primary.href} className={buttonVariants({ variant: "inverse" })}>
            {primary.label}
          </Link>
          <Link href={secondary.href} className={cn(buttonVariants({ variant: "link" }), "text-on-image")}>
            {secondary.label}
          </Link>
        </Cluster>
      </Container>
    </section>
  );
}
