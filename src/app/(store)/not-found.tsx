import type { Metadata } from "next";

import { NotFoundMessage } from "@/components/site/not-found-message";

export const metadata: Metadata = { title: "Page not found" };

/** notFound() from a storefront page: inside the (store) layout, so only the message. */
export default function NotFound() {
  return <NotFoundMessage />;
}
