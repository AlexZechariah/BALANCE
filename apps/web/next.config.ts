import path from 'node:path';

import type { NextConfig } from 'next';

const apiBasePath = process.env.API_BASE_PATH ?? process.env.NEXT_PUBLIC_API_BASE_PATH ?? '/api';
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';
const allowedDevOrigins = [
  // When you access the dev server via the LAN IP instead of localhost, Next.js will block HMR/dev assets
  // unless the origin is explicitly allowlisted.
  // Next.js examples show both "origin" (scheme+host+port) and hostname forms, so we include both.
  'localhost',
  '127.0.0.1',
  '192.168.192.1',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  '192.168.192.1:3000',
  'http://192.168.192.1:3000'
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  outputFileTracingIncludes: {
    '/*': [
      'node_modules/.pnpm/@pyroscope+nodejs@*/node_modules/@pyroscope/nodejs/**/*',
      'node_modules/.pnpm/@datadog+pprof@*/node_modules/@datadog/pprof/**/*'
    ]
  },
  serverExternalPackages: ['@pyroscope/nodejs', '@datadog/pprof'],
  turbopack: {
    root: path.resolve(__dirname, '../..')
  },
  allowedDevOrigins,
  transpilePackages: ['@balance/config', '@balance/types', '@balance/ui', '@balance/utils'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: `${apiBasePath}/:path((?!metrics$).*)`,
        destination: `${apiProxyTarget}/:path*`
      }
    ];
  }
};

export default nextConfig;
