import { Container, Section } from "@/components/primitives";
import type { Block } from "@/content/types";

type QuoteBlockProps = Extract<Block, { type: "quote" }>;

/** A pull quote at the text measure. */
export function QuoteBlock({ text, attribution }: QuoteBlockProps) {
  return (
    <Section spacing="compact">
      <Container size="prose">
        <figure className="flex flex-col gap-4 border-l border-strong pl-6">
          <blockquote className="text-headline">
            <p>{text}</p>
          </blockquote>
          {attribution && <figcaption className="eyebrow text-muted-foreground">{attribution}</figcaption>}
        </figure>
      </Container>
    </Section>
  );
}
