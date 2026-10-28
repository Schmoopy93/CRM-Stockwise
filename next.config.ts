import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin ships native-ish Node entry points; bundling it into the
  // server build breaks the gRPC/credential module resolution.
  serverExternalPackages: ["firebase-admin"],
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
