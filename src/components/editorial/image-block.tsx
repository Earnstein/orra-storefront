import Image from "next/image";

import { Container, Media, Section } from "@/components/primitives";
import type { Block } from "@/content/types";

type ImageBlockProps = Extract<Block, { type: "image" }>;

/** An editorial photo: edge to edge, or inset at the text measure. */
export function ImageBlock({ image, caption, width }: ImageBlockProps) {
  const full = width === "full";
  const figure = (
    <figure className="flex flex-col gap-3">
      <Media ratio={full ? "landscape" : "portrait"}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={full ? "100vw" : "(min-width: 640px) 38rem, 100vw"}
          className="object-cover"
        />
      </Media>
      {caption && (
        <figcaption className={full ? "px-gutter text-caption text-muted-foreground" : "text-caption text-muted-foreground"}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
  return <Section spacing="compact">{full ? figure : <Container size="prose">{figure}</Container>}</Section>;
}
