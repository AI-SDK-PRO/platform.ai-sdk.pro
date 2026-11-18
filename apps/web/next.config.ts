import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = {
  distDir: process.env.NEXT_DEV_DIST_DIR || '.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: ['@aisdkpro/ui', '@aisdkpro/client'],
  devIndicators: false,
  allowedDevOrigins: ['*.manus.computer', '*.run.app'],
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', '@aisdkpro/ui'],
    webpackMemoryOptimizations: true,
  },
  webpack: (webpackConfig, { dev }) => {
    if (dev) {
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/apps/agent-worker/**',
          '**/packages/create-webapp/templates/**',
        ],
      };
    }
    return webpackConfig;
  },
};
export default config;
