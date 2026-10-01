/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Google Fonts serves CSS from googleapis and font files from
              // gstatic; without both the UI silently drops to system fonts.
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              // REQUIRED by the resume viewer. CandidateDetail fetches the PDF
              // with an auth header, wraps it in a blob: URL and renders it in an
              // <iframe>. frame-src has no fallback other than default-src 'self',
              // so without blob: the browser blocks the frame and the pane is blank.
              "frame-src 'self' blob:",
              "object-src 'self' blob:",
              // Must name every API origin the app calls. This previously read
              // synthire-backend.workers.dev, which is not the deployed worker.
              [
                ...new Set(
                  [
                    "connect-src 'self'",
                    'http://localhost:8787',
                    process.env.NEXT_PUBLIC_API_URL || '',
                  ].filter(Boolean),
                ),
              ].join(' '),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
