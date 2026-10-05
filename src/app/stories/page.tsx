import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Container, Grid, Media, Section } from "@/components/primitives";
import { stories } from "@/content/stories";

export const metadata: Metadata = {
  title: "Stories",
  description: "How our pieces are made: the materials, the workshops and the people behind them.",
};

export default function StoriesPage() {
  return (
    <Section spacing="none" className="pb-section">
      <Container className="py-block">
        <div className="flex max-w-prose flex-col gap-3">
          <h1 className="text-headline">Stories</h1>
          <p className="text-muted-foreground">How our pieces are made: the materials, the workshops and the people behind them.</p>
        </div>
      </Container>
      <Container>
        <Grid layout="editorial" className="gap-y-block">
          {stories.map((story) => (
            <Link
              key={story.slug}
              href={`/stories/${story.slug}`}
              aria-labelledby={`story-${story.slug}`}
              className="group flex flex-col gap-4"
            >
              <Media ratio="portrait">
                <Image src={story.image.src} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              </Media>
              <div className="flex max-w-prose flex-col gap-2">
                <h2 id={`story-${story.slug}`} className="text-title">
                  {story.title}
                </h2>
                <p className="text-muted-foreground">{story.standfirst}</p>
                <span className="eyebrow link-quiet self-start group-hover:decoration-current">Read the story</span>
              </div>
            </Link>
          ))}
        </Grid>
      </Container>
    </Section>
  );
}
