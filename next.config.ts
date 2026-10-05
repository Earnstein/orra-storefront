import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Catalogue reads (src/lib/catalog/queries.ts) and the pages built from them are fresh for
  // 5 minutes; after that the next request still gets the cached copy while a fresh one renders
  // in the background (stale-while-revalidate). `expire` matches Next's default expireTime (one
  // year) so a page nobody has opened for a while is never rendered while the shopper waits.
  cacheLife: {
    catalog: { stale: 300, revalidate: 300, expire: 31_536_000 },
  },
  images: {
    // Unsplash URLs are resized by Unsplash's CDN; anything else uses Next's optimiser.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Adds 1440/2560/2880 so full-bleed images on 2x laptop screens don't jump from 2048 to 3840.
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 2560, 2880, 3840],
    qualities: [60, 75], // 60 for full-bleed hero photography, 75 default
    // Catalogue and editorial imagery (product images in the database, src/lib/content.ts). Replace with the real CDN.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }],
  },
};

export default nextConfig;
