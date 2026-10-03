import { FeaturedCollections } from "@/components/home/featured-collections";
import { HomeHero } from "@/components/home/home-hero";
import { HomeIntro } from "@/components/home/home-intro";
import { NewArrivals } from "@/components/home/new-arrivals";
import { ProductSpotlight } from "@/components/home/product-spotlight";
import { ServicesStrip } from "@/components/home/services-strip";
import { StoryBand } from "@/components/home/story-band";

// New arrivals and the spotlight come from the database; refresh at most every 5 minutes.
export const revalidate = 300;

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeIntro />
      <FeaturedCollections />
      <NewArrivals />
      <StoryBand />
      <ProductSpotlight />
      <ServicesStrip />
    </>
  );
}
