import { StoreFrame } from "@/components/site/store-frame";

/** Every storefront page. The admin (src/app/admin) has its own header instead. */
export default function StoreLayout({ children }: LayoutProps<"/">) {
  return <StoreFrame>{children}</StoreFrame>;
}
