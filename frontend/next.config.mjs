/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // optimizePackageImports speeds up lucide-react tree-shaking
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
