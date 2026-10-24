import type { NextConfig } from 'next';
const config: NextConfig = {
  images: {
    remotePatterns: [
      'avatars.mds.yandex.net',
      'cdnrrviubnyuntopbez5.svc.cdn.yandex.net',
      'st.kp.yandex.net',
      'image.openmoviedb.com',
      'image.tmdb.org',
      'kinopoiskapiunofficial.tech',
      'images.kinopoiskapiunofficial.tech',
    ].map((hostname) => ({ protocol: 'https' as const, hostname, port: '' })),
    minimumCacheTTL: 86400,
    imageSizes: [48, 64, 96, 128, 192, 256, 384],
    deviceSizes: [640, 960, 1280],
    maximumRedirects: 2,
  },
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
