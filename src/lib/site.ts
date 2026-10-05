/** Store-wide settings. `name` is a placeholder until the brand is decided. */
export const site = {
  name: "Orra",
  description: "Leather goods, shoes and ready-to-wear, made to last.",
  locale: "en-US",
  currency: "USD",
} as const;

export type NavLink = { label: string; href: string };

export const primaryNav: NavLink[] = [
  { label: "New in", href: "/collections/new" },
  { label: "Women", href: "/collections/women" },
  { label: "Men", href: "/collections/men" },
  { label: "Bags", href: "/collections/bags" },
  { label: "Shoes", href: "/collections/shoes" },
  { label: "Accessories", href: "/collections/accessories" },
];

export const footerNav: { title: string; links: NavLink[] }[] = [
  {
    title: "Help",
    links: [
      { label: "Contact us", href: "/help/contact" },
      { label: "Delivery", href: "/help/delivery" },
      { label: "Returns", href: "/help/returns" },
      { label: "Size guide", href: "/help/size-guide" },
    ],
  },
  {
    title: "Services",
    links: [
      { label: "Gift wrapping", href: "/services/gifting" },
      { label: "Repairs and care", href: "/services/care" },
      { label: "Book an appointment", href: "/services/appointments" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Our story", href: "/about" },
      { label: "Stories", href: "/stories" },
      { label: "Materials", href: "/about/materials" },
      { label: "Careers", href: "/about/careers" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "Cookies", href: "/legal/cookies" },
    ],
  },
];
