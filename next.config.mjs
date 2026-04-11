/** @type {import('next').NextConfig} */

// Security headers applied to every response. Kept here (rather than
// in the middleware) so they cover static assets and error pages too.
//
// Notes on the CSP:
//   - 'unsafe-inline' in style-src is unavoidable with Tailwind in Next
//     because the framework injects inline styles for hot reload and for
//     the static route manifest; tightening this requires nonce support
//     that Next 14 doesn't ship for the App Router yet.
//   - 'unsafe-eval' is NOT allowed; we only need 'self' for scripts.
//   - media-src blob: and 'self' are required for the /scan page's
//     camera stream when served by html5-qrcode.
//   - frame-ancestors 'none' hard-blocks clickjacking. If you ever need
//     to embed the app in an iframe (e.g. an ops dashboard), relax to
//     specific origins rather than removing this directive.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
