import Image from "next/image";

import { Media, Section, Stack, TextLink } from "@/components/primitives";
import { story } from "@/lib/content";

/** Editorial split on the surface band: image 7/12, copy 5/12 from lg up. */
export function StoryBand() {
  return (
    <Section tone="surface" spacing="none" aria-labelledby="story-heading">
      <div className="grid lg:grid-cols-12">
        <Media ratio="landscape" className="lg:col-span-7 lg:aspect-auto lg:min-h-144">
          <Image src={story.image.src} alt={story.image.alt} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
        </Media>
        <Stack gap="lg" className="justify-center px-gutter py-section lg:col-span-5 lg:px-section">
          <h2 id="story-heading" className="text-headline">
            {story.title}
          </h2>
          <p className="max-w-prose text-muted-foreground">{story.body}</p>
          <TextLink href={story.href} label className="self-start">
            {story.linkLabel}
          </TextLink>
        </Stack>
      </div>
    </Section>
  );
}
