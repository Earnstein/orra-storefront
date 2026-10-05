import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Catalogue reads (src/lib/catalog/queries.ts) are cached with this lifetime: served for up to
  // 5 minutes, refreshed in the background after that.
  cacheLife: {
    catalog: { stale: 300, revalidate: 300, expire: 3600 },
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
