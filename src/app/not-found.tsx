import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/site/not-found-message";
import { StoreFrame } from "@/components/site/store-frame";

export const metadata: Metadata = { title: "Page not found" };

/**
 * URLs that match no route, and notFound() from the admin's layout (so the admin isn't
 * advertised). Both render outside the (store) layout, so this brings the storefront's frame
 * itself; notFound() from a storefront page renders (store)/not-found.tsx inside it instead.
 */
export default function NotFound() {
  return (
    <StoreFrame>
      <NotFoundMessage />
    </StoreFrame>
  );
}
