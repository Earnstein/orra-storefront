import { EditorialBlocks } from "@/components/editorial/editorial-blocks";
import { landingMetadata } from "@/components/editorial/landing";
import { landings } from "@/content/landings";

// Content lives in code; the products it shows refresh at most every 5 minutes.
export const revalidate = 300;

export const metadata = landingMetadata(landings.men);

export default function MenPage() {
  return <EditorialBlocks blocks={landings.men.blocks} />;
}
