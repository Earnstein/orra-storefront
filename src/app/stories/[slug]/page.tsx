import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EditorialBlocks } from "@/components/editorial/editorial-blocks";
import { StoryBlock } from "@/components/editorial/story-block";
import { getStory, stories } from "@/content/stories";
import { ogImage } from "@/lib/metadata";

// Stories live in code, so every page is prerendered; the products they show come from cached
// catalogue reads. Unknown slugs render on request and 404 through notFound().

// Params outside generateStaticParams (including unknown slugs) render on request and must block
// rather than stream, so notFound() still returns a real 404 (streaming would send a 200 first).
export const instant = false;

export function generateStaticParams() {
  return stories.map((story) => ({ slug: story.slug }));
}

export async function generateMetadata({ params }: PageProps<"/stories/[slug]">): Promise<Metadata> {
  const story = getStory((await params).slug);
  if (!story) return {};
  return {
    title: story.title,
    description: story.description,
    openGraph: { type: "article", images: [ogImage(story.image)] },
  };
}

export default async function StoryPage({ params }: PageProps<"/stories/[slug]">) {
  const story = getStory((await params).slug);
  if (!story) notFound();
  const next = stories[(stories.indexOf(story) + 1) % stories.length];

  return (
    <article>
      <EditorialBlocks blocks={story.blocks} />
      {next !== story && (
        <StoryBlock
          type="story"
          image={next.image}
          title={next.title}
          body={next.standfirst}
          action={{ label: "Read the story", href: `/stories/${next.slug}` }}
        />
      )}
    </article>
  );
}
