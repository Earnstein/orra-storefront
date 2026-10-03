import { GiftIcon, RotateCcwIcon, TruckIcon, type LucideIcon } from "lucide-react";

import { Container, Grid, Section, Stack } from "@/components/primitives";
import { services } from "@/lib/content";

const icons: Record<(typeof services)[number]["icon"], LucideIcon> = {
  truck: TruckIcon,
  returns: RotateCcwIcon,
  gift: GiftIcon,
};

export function ServicesStrip() {
  return (
    <Section spacing="compact" className="border-t" aria-label="Services">
      <Container>
        <Grid layout="cards" className="gap-block">
          {services.map((service) => {
            const Icon = icons[service.icon];
            return (
              <Stack key={service.title} gap="sm">
                <Icon aria-hidden className="size-5 stroke-[1.5]" />
                <h2 className="font-medium">{service.title}</h2>
                <p className="caption text-muted-foreground">{service.body}</p>
              </Stack>
            );
          })}
        </Grid>
      </Container>
    </Section>
  );
}
