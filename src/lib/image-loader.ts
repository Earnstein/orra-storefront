"use client";

type LoaderProps = { src: string; width: number; quality?: number };

/**
 * next/image loader. Unsplash (imgix) resizes and re-encodes on its own CDN, so those
 * URLs get width/quality/format params and load straight from the CDN. Everything else
 * goes through Next's built-in optimiser.
 */
export default function imageLoader({ src, width, quality }: LoaderProps) {
  if (src.startsWith("https://images.unsplash.com/")) {
    const url = new URL(src);
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(quality ?? 75));
    url.searchParams.set("auto", "format"); // AVIF/WebP where supported
    // Keep crops baked into the source URL (e.g. product close-ups); otherwise never upscale.
    if (!url.searchParams.has("fit")) url.searchParams.set("fit", "max");
    return url.toString();
  }
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`;
}
