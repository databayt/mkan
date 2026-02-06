import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Strict mode for better React development
  reactStrictMode: true,

  // PoweredByHeader removal for security
  poweredByHeader: false,

  // Compress responses
  compress: true,

  // Generate ETags for caching
  generateEtags: true,

  // Production source maps for error tracking
  productionBrowserSourceMaps: false, // Set to true if you need client-side source maps

  // Transpile packages that have issues with Turbopack
  transpilePackages: [
    'react-day-picker',
    'date-fns',
  ],

  // Experimental features
  // Externalize packages that break when bundled by webpack
  serverExternalPackages: ['jsdom'],

  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
    },
    // Optimize packages for server
    optimizePackageImports: [
      '@radix-ui/react-icons',
      'lucide-react',
      'react-icons',
      '@sentry/nextjs',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'via.placeholder.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      // ImageKit CDN
      {
        protocol: 'https',
        hostname: 'ik.imagekit.io',
        port: '',
        pathname: '/**',
      },
      // AWS S3 and CloudFront
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.cloudfront.net',
        port: '',
        pathname: '/**',
      },
      // Google Photos/Drive
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      // Facebook CDN
      {
        protocol: 'https',
        hostname: 'platform-lookaside.fbsbx.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  // Enable Turbopack for development (default in Next.js 16)
  turbopack: {},

  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Ignore optional dependencies that might cause issues
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Externalize jsdom on server to prevent its CSS file path from breaking
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('jsdom');
    }

    return config;
  },

  // Headers configuration for security and caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Redirects for common patterns
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
      {
        source: '/signin',
        destination: '/login',
        permanent: true,
      },
      {
        source: '/signup',
        destination: '/register',
        permanent: true,
      },
    ];
  },
};

// Sentry configuration wrapper
const sentryWebpackPluginOptions = {
  // Sentry options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppresses source map uploading logs during build
  silent: true,

  // Upload a larger set of source maps for prettier stack traces
  widenClientFileUpload: true,

  // Transpiles SDK to be compatible with IE11
  transpileClientSDK: true,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Disables org/project/auth token validation
  disableLogger: true,

  // Automatically release
  automaticVercelMonitors: true,
};

// Export with Sentry if configured, otherwise export plain config
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig;
