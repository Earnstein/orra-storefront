import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Unsplash URLs are resized by Unsplash's CDN; anything else uses Next's optimiser.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Adds 1440/2560/2880 so full-bleed images on 2x laptop screens don't jump from 2048 to 3840.
    deviceSizes: [640, 750, 828, 1080, 1200, 1440, 1920, 2048, 2560, 2880, 3840],
    qualities: [60, 75], // 60 for full-bleed hero photography, 75 default
    // Sample catalogue imagery (src/lib/catalog/sample-data.ts). Replace with the real CDN.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }],
  },
};

export default nextConfig;
