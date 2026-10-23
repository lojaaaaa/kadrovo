import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@filmless/contracts'],
  async rewrites() {
    // Compose routes these paths through Caddy; these rewrites support pnpm dev.
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3001/api/:path*',
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:3001/socket.io/:path*',
      },
    ];
  },
};
export default config;
