/** @type {import('next').NextConfig} */
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
};

export default nextConfig;
