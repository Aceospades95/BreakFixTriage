/** @type {import('next').NextConfig} */

// Security headers applied to every response. Kept here (rather than
// in the middleware) so they cover static assets and error pages too.
//
// Notes on the CSP:
//   - 'unsafe-inline' in style-src is unavoidable with Tailwind in Next
//     because the framework injects inline styles for hot reload and for
//     the static route manifest; tightening this requires nonce support
//     that Next 14 doesn't ship for the App Router yet.
//   - 'unsafe-eval' is allowed in development ONLY: Next.js dev mode
//     evaluates HMR/source-map chunks through eval, and without it React
//     never hydrates — every client component (bulk actions, accordion,
//     photo capture, signature pad, maps) silently plays dead. Production
//     builds do not need it and do not get it.
//   - img-src allows the OpenStreetMap tile servers (the default route
//     map) and api.mapbox.com (the optional static-map upgrade when
//     NEXT_PUBLIC_MAPBOX_TOKEN is set). Without these the map renders
//     as an empty gray box because every tile request is blocked.
//   - media-src blob: and 'self' are required for the /scan page's
//     camera stream when served by html5-qrcode.
//   - frame-ancestors 'none' hard-blocks clickjacking. If you ever need
//     to embed the app in an iframe (e.g. an ops dashboard), relax to
//     specific origins rather than removing this directive.
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://api.mapbox.com",
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
      // Round-13 §1I + §2D — portal pages override Referrer-Policy
      // to `no-referrer` so a school IT lead clicking a link from
      // /portal/[token] never leaks the bearer URL via the Referer
      // header.
      {
        source: "/portal/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
