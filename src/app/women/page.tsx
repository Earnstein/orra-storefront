import { EditorialBlocks } from "@/components/editorial/editorial-blocks";
import { landingMetadata } from "@/lib/metadata";
import { landings } from "@/content/landings";

// Content lives in code; the products it shows come from cached catalogue reads.

export const metadata = landingMetadata(landings.women);

export default function WomenPage() {
  return <EditorialBlocks blocks={landings.women.blocks} />;
}
