import { Container, Section } from "@/components/primitives";

export function HomeIntro() {
  return (
    <Section>
      <Container size="prose" className="text-center">
        <p className="text-title font-normal">
          Fewer, better things. Bags, shoes and clothes in leather, wool and silk, made in small runs and
          built to be repaired rather than replaced.
        </p>
      </Container>
    </Section>
  );
}
