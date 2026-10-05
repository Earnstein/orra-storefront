import type { Story } from "./types";

// Editorial stories, rendered at /stories/<slug> by EditorialBlocks. content.test.ts checks every
// link, product and image against the seed catalogue. Photos are from Unsplash (free licence),
// checked at full resolution for logos and marks.

function unsplash(id: string) {
  return `https://images.unsplash.com/photo-${id}`;
}

const knitwear: Story = {
  slug: "knitwear",
  title: "Knitwear, made slowly",
  description: "How our knitwear is made: undyed merino, finished by hand and left to rest before it is pressed.",
  standfirst:
    "Each piece is knitted from undyed merino and finished by hand, then left to rest before it is pressed. It takes longer. It also keeps its shape for years.",
  image: {
    src: unsplash("1558769132-cb1aea458c5e"),
    alt: "Rail of neutral-toned knitwear beside dried pampas grass",
  },
  blocks: [
    {
      type: "hero",
      image: {
        src: unsplash("1558769132-cb1aea458c5e"),
        alt: "Rail of neutral-toned knitwear beside dried pampas grass",
      },
      eyebrow: "Stories",
      title: "Knitwear, made slowly",
    },
    {
      type: "text",
      paragraphs: [
        "Every sweater we sell starts as a cone of undyed merino. It is knitted on narrow frames, a panel at a time, then joined by hand so the seams lie flat against the body instead of standing proud of it.",
        "None of this is fast. A single sweater spends most of a week between the knitting room and the finishing table. We think the difference shows on the first day you wear it, and more so on the hundredth.",
      ],
    },
    {
      type: "image",
      image: {
        src: unsplash("1598871956091-1b9681ae2bf0"),
        alt: "Undyed wool yarn and a half-knitted panel on steel needles",
      },
      width: "full",
    },
    {
      type: "text",
      heading: "Undyed, on purpose",
      paragraphs: [
        "We leave most of our wool the colour it grew: cream, oatmeal, a soft grey. Skipping the dye bath keeps the fibre softer and saves water, and the natural shades sit together in a way that dyed ones rarely do.",
        "Where we do add colour, as in the rust lambswool, it goes into the yarn before knitting, never into the finished piece, so it can't fade unevenly along the seams.",
      ],
    },
    {
      type: "quote",
      text: "We would rather make fewer sweaters and see each one worn for ten winters.",
      attribution: "The knitting room",
    },
    {
      type: "image",
      image: {
        src: unsplash("1670764732262-331943e5af5e"),
        alt: "Close-up of a twisted skein of undyed wool",
      },
      caption: "Undyed merino, before it is wound onto cones.",
      width: "inset",
    },
    {
      type: "text",
      heading: "Rest, then press",
      paragraphs: [
        "Fresh from the frame, knitted wool is under tension. We wash each piece by hand and lay it flat to dry for two days, so the stitches settle into their natural shape before it is pressed and finished.",
        "It is the step most makers skip, and the reason a well-made sweater still fits the way it did when you bought it.",
      ],
    },
    {
      type: "image",
      image: {
        src: unsplash("1598871956222-26b66d6559fe"),
        alt: "Balls of natural wool yarn in cream, brown and grey",
      },
      width: "inset",
    },
    {
      type: "productRow",
      heading: "Shop the story",
      productSlugs: ["knit-sweater-rust", "merino-v-neck", "fringed-knit-poncho", "overcoat-camel"],
      action: { label: "Shop ready-to-wear", href: "/collections/ready-to-wear" },
    },
  ],
};

const leatherWorkshop: Story = {
  slug: "leather-workshop",
  title: "The leather workshop",
  description: "Inside the workshop where our leather goods are cut, saddle-stitched and edged by hand.",
  standfirst:
    "Our bags and small leather goods are cut, stitched and edged by hand from vegetable-tanned leather, in a workshop small enough that everyone knows whose hands made what.",
  image: {
    src: unsplash("1628483211662-9bcc692c46dc"),
    alt: "Tan leather card wallet on a workbench beside a pricking iron and an awl",
  },
  blocks: [
    {
      type: "hero",
      image: {
        src: unsplash("1628483211662-9bcc692c46dc"),
        alt: "Tan leather card wallet on a workbench beside a pricking iron and an awl",
      },
      eyebrow: "Stories",
      title: "The leather workshop",
    },
    {
      type: "text",
      paragraphs: [
        "Our leather is vegetable-tanned: cured slowly with bark extracts rather than chrome salts. It arrives stiff and pale, and it darkens and softens with every month of use, taking on the shape of the way you carry it.",
        "Each hide is laid out and read before a knife touches it. The firmest leather from the back goes into straps and handles; the softer belly is kept for linings and pockets.",
      ],
    },
    {
      type: "image",
      image: {
        src: unsplash("1716295177956-420a647c83ac"),
        alt: "Close-up of saddle-stitched tan leather with natural creasing",
      },
      caption: "Saddle stitching: one thread, a needle at each end.",
      width: "full",
    },
    {
      type: "text",
      heading: "Two needles, one thread",
      paragraphs: [
        "Every seam is saddle-stitched by hand. The holes are punched with a pricking iron, then a single waxed thread is worked through them with a needle at each end, so each stitch locks the one before it.",
        "A machine lockstitch unravels once it is cut. A saddle stitch doesn't, which is why a hand-stitched strap can outlast the bag it was made for.",
      ],
    },
    {
      type: "quote",
      text: "A good bag should be easier to repair than to replace.",
      attribution: "The leather workshop",
    },
    {
      type: "image",
      image: {
        src: unsplash("1755924648847-f733ed2818c8"),
        alt: "A worn leather apron hanging on a workshop door",
      },
      width: "inset",
    },
    {
      type: "text",
      heading: "Made to be mended",
      paragraphs: [
        "Edges are bevelled, sanded and burnished with beeswax until they are smooth to the touch. Hardware is solid brass, screwed rather than glued, so a worn strap or a broken clasp can be replaced in the same workshop years from now.",
      ],
    },
    {
      type: "productRow",
      heading: "Shop the story",
      productSlugs: ["leather-tote-tan", "structured-handbag-brown", "leather-messenger-brown", "braided-belt-brown"],
      action: { label: "Shop bags", href: "/collections/bags" },
    },
  ],
};

export const stories: Story[] = [knitwear, leatherWorkshop];

/** The story featured in the homepage band. */
export const homepageStory = knitwear;

export function getStory(slug: string): Story | undefined {
  return stories.find((story) => story.slug === slug);
}
