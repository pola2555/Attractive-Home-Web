import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // TEMPORARY: hides the floating Next.js dev-tools badge in `next dev`.
  // Remove this line to bring the indicator back.
  devIndicators: false,
  // Drop the `X-Powered-By: Next.js` response header (don't advertise the stack).
  poweredByHeader: false,
};

export default nextConfig;
