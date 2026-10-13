import type { Metadata } from "next";

import { CheckoutView } from "@/components/checkout/checkout-view";
import { Container } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

// Static: checkout starts in the browser (CheckoutView), so the page itself is prerendered.
export default function CheckoutPage() {
  return (
    <Container className="py-section">
      <CheckoutView />
    </Container>
  );
}
