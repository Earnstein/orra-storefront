import Image from "next/image";

import { Media, Section, Stack, TextLink } from "@/components/primitives";
import type { Block } from "@/content/types";

type StoryBlockProps = Extract<Block, { type: "story" }>;

/** Editorial split on the surface band, as on the homepage: image 7/12, copy 5/12 from lg up. */
export function StoryBlock({ image, title, body, action }: StoryBlockProps) {
  return (
    <Section tone="surface" spacing="none">
      <div className="grid lg:grid-cols-12">
        <Media ratio="landscape" className="lg:col-span-7 lg:aspect-auto lg:min-h-144">
          <Image src={image.src} alt={image.alt} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
        </Media>
        <Stack gap="lg" className="justify-center px-gutter py-section lg:col-span-5 lg:px-section">
          <h2 className="text-headline">{title}</h2>
          <p className="max-w-prose text-muted-foreground">{body}</p>
          <TextLink href={action.href} label className="self-start">
            {action.label}
          </TextLink>
        </Stack>
      </div>
    </Section>
  );
}
