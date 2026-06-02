import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Allow the containerized Playwright browser (Docker MCP) to load
  // dev/HMR assets cross-origin when it reaches the dev server via
  // host.docker.internal. Dev-only; no effect on production.
  allowedDevOrigins: ['host.docker.internal'],
};

export default withNextIntl(nextConfig);
