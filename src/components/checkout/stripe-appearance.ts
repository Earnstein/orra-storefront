import type { StripeCheckoutElementsOptions } from "@stripe/stripe-js";

// Stripe's fields live in its iframes, so Orra's tokens are repeated here as hex (Stripe doesn't
// read OKLCH or our CSS variables): ink #0d0d0d (--foreground), muted #5b5b5b, hairline #dedede
// (--border), surface #f4f3f2, error #c51e21 (--destructive). Square corners and underlined
// fields, like the site's inputs; Geist from Google Fonts, the same family next/font serves.
export const stripeElementsOptions: StripeCheckoutElementsOptions = {
  fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500&display=swap" }],
  appearance: {
    theme: "flat",
    labels: "above",
    variables: {
      fontFamily: "Geist, system-ui, sans-serif",
      fontSizeBase: "14px",
      colorPrimary: "#0d0d0d",
      colorText: "#0d0d0d",
      colorTextSecondary: "#5b5b5b",
      colorTextPlaceholder: "#5b5b5b",
      colorBackground: "#ffffff",
      colorDanger: "#c51e21",
      borderRadius: "0px",
      spacingUnit: "4px",
      focusBoxShadow: "none",
      focusOutline: "none",
    },
    rules: {
      // As the site's own field labels (FieldLabel: 14px, medium, ink), e.g. Phone number beside them.
      ".Label": { fontSize: "14px", fontWeight: "500", color: "#0d0d0d", marginBottom: "8px" },
      ".Input": { backgroundColor: "#ffffff", border: "none", borderBottom: "1px solid #0d0d0d", boxShadow: "none", padding: "10px 2px", fontSize: "16px" },
      ".Input:focus": { borderBottom: "2px solid #0d0d0d", boxShadow: "none" },
      ".Input--invalid": { borderBottom: "1px solid #c51e21", boxShadow: "none" },
      ".Tab": { border: "1px solid #dedede", boxShadow: "none", backgroundColor: "#ffffff" },
      ".Tab--selected": { border: "1px solid #0d0d0d", boxShadow: "none" },
      ".Tab:focus": { boxShadow: "none", outline: "2px solid #0d0d0d" },
      ".Block": { backgroundColor: "#f4f3f2", boxShadow: "none", border: "none" },
    },
  },
};
