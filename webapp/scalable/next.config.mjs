import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Makes static hosting (Amplify/S3) reliable for deep links:
  // `/dashboard/vault` -> `/dashboard/vault/` and exports as `/dashboard/vault/index.html`
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'plus.unsplash.com', pathname: '/**' },
    ],
  },
  webpack: (config) => {
    config.resolve.modules = [path.join(__dirname, 'node_modules'), 'node_modules'];
    return config;
  },
};

export default nextConfig;
