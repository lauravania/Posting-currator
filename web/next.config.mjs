/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Competitor reference screenshots are uploaded via a server action
      // (low volume, unlike the wedding photo batch upload which goes
      // through a dedicated route handler for progress/concurrency).
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
