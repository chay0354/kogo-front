/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/course',
        destination: '/courses',
        permanent: true,
      },
      {
        source: '/course/:path*',
        destination: '/courses/:path*',
        permanent: false,
      },
    ];
  },
}

module.exports = nextConfig

