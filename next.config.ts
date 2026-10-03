import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Unsplash URLs are resized by Unsplash's CDN; anything else uses Next's optimiser.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    // Sample catalogue imagery (src/lib/catalog/sample-data.ts). Replace with the real CDN.
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com", pathname: "/**" }],
  },
};

export default nextConfig;
