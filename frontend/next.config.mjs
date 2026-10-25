/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Security headers are NOT set here: the Cloudflare Pages build ignores
  // `headers()`, which left production with none (SYN-060). They are applied
  // to every page by middleware.ts, from lib/security-headers.ts.
}

export default nextConfig
