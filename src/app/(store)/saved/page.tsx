import type { Metadata } from "next";

import { Container } from "@/components/primitives";
import { SavedView } from "@/components/saved/saved-view";

export const metadata: Metadata = {
  title: "Saved items",
  robots: { index: false },
};

// Static: the list is this browser's or the account's, read in the browser (SavedView).
export default function SavedPage() {
  return (
    <Container className="py-section">
      <SavedView />
    </Container>
  );
}
