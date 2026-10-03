import { heroSlides } from "@/lib/catalog/sample-data";
import { site } from "@/lib/site";
import { HeroCarousel } from "./hero-carousel";

export function HomeHero() {
  return <HeroCarousel slides={heroSlides} siteName={site.name} siteDescription={site.description} />;
}
