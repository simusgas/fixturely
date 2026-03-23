/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/courts/book': ['./node_modules/@sparticuz/chromium/bin/**'],
  },
};

export default nextConfig;
