import type { Metadata } from "next";

import { NEW_ARRIVALS_DESCRIPTION, NewArrivalsListing } from "./new-arrivals-listing";

// Products come from the database; refresh at most every 5 minutes, like the homepage.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "New arrivals",
  description: NEW_ARRIVALS_DESCRIPTION,
};

export default function NewArrivalsPage() {
  return <NewArrivalsListing />;
}
