import type { Metadata } from "next";
import { Suspense } from "react";

import { SuccessView } from "@/components/checkout/success-view";
import { Container } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false },
};

// Static: the order is confirmed in the browser (SuccessView reads ?checkout), so the page is prerendered.
export default function CheckoutSuccessPage() {
  return (
    <Container className="py-section">
      <Suspense
        fallback={
          <div className="flex flex-col gap-block" aria-busy>
            <h1 className="text-title uppercase">Confirming your payment…</h1>
            <Skeleton className="h-72 bg-surface" />
          </div>
        }
      >
        <SuccessView />
      </Suspense>
    </Container>
  );
}
