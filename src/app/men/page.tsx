import { EditorialBlocks } from "@/components/editorial/editorial-blocks";
import { landingMetadata } from "@/lib/metadata";
import { landings } from "@/content/landings";

// Content lives in code; the products it shows come from cached catalogue reads.

export const metadata = landingMetadata(landings.men);

export default function MenPage() {
  return <EditorialBlocks blocks={landings.men.blocks} />;
}
