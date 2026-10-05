import Image from "next/image";

import { Container, Media, Section, TextLink } from "@/components/primitives";
import type { Block } from "@/content/types";

type HeroBlockProps = Extract<Block, { type: "hero" }> & {
  /** The first block is the page's h1; later heroes are h2s. */
  headingLevel: "h1" | "h2";
};

/** Full-bleed campaign image with copy over a scrim, bottom-left. */
export function HeroBlock({ image, focal, eyebrow, title, body, action, headingLevel: Heading }: HeroBlockProps) {
  return (
    <Section spacing="none" className="relative">
      <Media
        ratio="hero"
        style={
          {
            "--focal-mobile": focal?.mobile ?? "50% 50%",
            "--focal-desktop": focal?.desktop ?? "50% 50%",
          } as React.CSSProperties
        }
      >
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="100vw"
          priority={Heading === "h1"}
          className="object-cover object-(--focal-mobile) md:object-(--focal-desktop)"
        />
      </Media>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-scrim/75 via-scrim/30 via-45% to-scrim/0 to-80%" />
      <Container className="absolute inset-x-0 bottom-0 flex flex-col gap-4 pb-block text-on-image">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Heading className="max-w-[16ch] text-display">{title}</Heading>
        {body && <p className="max-w-prose">{body}</p>}
        {action && (
          <TextLink href={action.href} label className="mt-2 self-start">
            {action.label}
          </TextLink>
        )}
      </Container>
    </Section>
  );
}
