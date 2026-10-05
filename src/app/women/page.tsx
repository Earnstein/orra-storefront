import { EditorialBlocks } from "@/components/editorial/editorial-blocks";
import { landingMetadata } from "@/lib/metadata";
import { landings } from "@/content/landings";

// Content lives in code; the products it shows refresh at most every 5 minutes.
export const revalidate = 300;

export const metadata = landingMetadata(landings.women);

export default function WomenPage() {
  return <EditorialBlocks blocks={landings.women.blocks} />;
}
