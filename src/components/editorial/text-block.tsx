import { Container, Section, Stack, TextLink } from "@/components/primitives";
import type { Block } from "@/content/types";

type TextBlockProps = Extract<Block, { type: "text" }>;

/** Copy at a readable measure. */
export function TextBlock({ heading, paragraphs, action }: TextBlockProps) {
  return (
    <Section spacing="compact">
      <Container size="prose">
        <Stack gap="lg">
          {heading && <h2 className="text-title">{heading}</h2>}
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {action && (
            <TextLink href={action.href} label className="self-start">
              {action.label}
            </TextLink>
          )}
        </Stack>
      </Container>
    </Section>
  );
}
