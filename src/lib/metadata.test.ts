import { describe, expect, it } from "vitest";

import { ogImage } from "./metadata";

describe("ogImage", () => {
  it("asks Unsplash for a 1200px share image, keeping any crop parameters", () => {
    expect(ogImage({ src: "https://images.unsplash.com/photo-1", alt: "A" })).toEqual({
      url: "https://images.unsplash.com/photo-1?w=1200",
      alt: "A",
    });
    expect(ogImage({ src: "https://images.unsplash.com/photo-1?ar=4%3A5&fit=crop", alt: "B" }).url).toBe(
      "https://images.unsplash.com/photo-1?ar=4%3A5&fit=crop&w=1200",
    );
  });
});
