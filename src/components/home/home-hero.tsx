import { heroSlides } from "@/lib/content";
import { site } from "@/lib/site";
import { HeroCarousel } from "./hero-carousel";

export function HomeHero() {
  return <HeroCarousel slides={heroSlides} siteName={site.name} siteDescription={site.description} />;
}
