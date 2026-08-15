/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'DENY' }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/lead-import',
        destination: '/prospect?tab=import',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
