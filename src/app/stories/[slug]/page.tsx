import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EditorialBlocks } from "@/components/editorial/editorial-blocks";
import { StoryBlock } from "@/components/editorial/story-block";
import { getStory, stories } from "@/content/stories";

// Stories live in code, so every page is prerendered; the products they show refresh at most
// every 5 minutes, like the rest of the catalogue. Unknown slugs 404 through notFound() rather
// than dynamicParams = false, which logs an internal NoFallbackError for each one.
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return stories.map((story) => ({ slug: story.slug }));
}

export async function generateMetadata({ params }: PageProps<"/stories/[slug]">): Promise<Metadata> {
  const story = getStory((await params).slug);
  if (!story) return {};
  const image = new URL(story.image.src);
  image.searchParams.set("w", "1200");
  return {
    title: story.title,
    description: story.description,
    openGraph: { type: "article", images: [{ url: image.toString(), alt: story.image.alt }] },
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
