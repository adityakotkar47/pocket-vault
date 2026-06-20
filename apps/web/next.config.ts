import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  transpilePackages: ["@pocketvault/api", "@pocketvault/db"],
};

export default nextConfig;
