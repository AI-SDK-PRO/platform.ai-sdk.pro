import type { NextConfig } from 'next';
import path from 'node:path';
// Sandbox preview only: the Base44 preview proxy reaches the dev server from
// https://3000-<suffix>. Never active outside the preview environment.
const previewDevOrigins =
  process.env.BASE44_PREVIEW_MODE === "1" && process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
    : [];

const config: NextConfig = {
  distDir: process.env.NEXT_DEV_DIST_DIR || '.next',
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: ['@aisdkpro/ui', '@aisdkpro/client'],
  devIndicators: false,
  allowedDevOrigins: ['*.manus.computer', '*.run.app', ...previewDevOrigins],
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', '@aisdkpro/ui'],
    webpackMemoryOptimizations: true,
  },
  webpack: (webpackConfig, { dev }) => {
    if (dev) {
      webpackConfig.devtool = false;
      webpackConfig.watchOptions = {
        ...webpackConfig.watchOptions,
        ignored: [
          '**/.git/**',
          '**/.next/**',
          '**/.next-dev/**',
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
