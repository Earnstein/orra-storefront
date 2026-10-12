import type { Metadata } from "next";

import { BagView } from "@/components/bag/bag-view";
import { Container } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Shopping bag",
  robots: { index: false },
};

// Static: the bag is read in the browser (BagView), so the page itself is prerendered.
export default function BagPage() {
  return (
    <Container className="py-section">
      <BagView />
    </Container>
  );
}
