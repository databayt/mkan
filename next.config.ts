import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzerFactory from "@next/bundle-analyzer";

const withBundleAnalyzer = withBundleAnalyzerFactory({
  enabled: process.env.ANALYZE === "true",
});

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

  // Externalize packages that break when webpack tries to bundle them.
  //
  // jsdom — its CSS file path breaks webpack.
  //
  // Sentry + OpenTelemetry — Sentry's CJS server bundle requires
  // OpenTelemetry's ESM-only build, which fails at runtime with
  // `Error: require() of ES Module` on Vercel's Node serverless
  // function. Listing them here keeps them as real Node packages so
  // Node handles the ESM/CJS boundaries instead of webpack.
  // Note: `@sentry/nextjs` itself is already added to `transpilePackages`
  // by `withSentryConfig`, so it cannot go here. The rest are the server
  // SDK + instrumentation that get pulled in transitively.
  serverExternalPackages: [
    'jsdom',
    '@sentry/node',
    '@sentry/core',
    '@opentelemetry/api',
    '@opentelemetry/instrumentation',
    '@prisma/instrumentation',
  ],

  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
    },
    // Optimize packages for server
    optimizePackageImports: [
      'lucide-react',
      '@sentry/nextjs',
      'framer-motion',
      'date-fns',
      'react-day-picker',
      'lodash',
      'react-select',
      'mapbox-gl',
      '@radix-ui/react-popover',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-toast',
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
      { source: '/home', destination: '/', permanent: true },
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/signup', destination: '/register', permanent: true },
      // Epic 3.4: Unify /search and /searching into canonical /listings.
      // 308 preserves query params; both legacy routes loaded all listings
      // into memory and filtered client-side — /listings is the canonical
      // server-filtered path. Use a regex-constrained `:lang` param to avoid
      // catching /api/search/... (where `api` would match `:lang` otherwise).
      { source: '/:lang(en|ar)/search/:path*', destination: '/:lang/listings/:path*', permanent: true },
      { source: '/:lang(en|ar)/search', destination: '/:lang/listings', permanent: true },
      { source: '/:lang(en|ar)/searching/:path*', destination: '/:lang/listings/:path*', permanent: true },
      { source: '/:lang(en|ar)/searching', destination: '/:lang/listings', permanent: true },
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

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Disables org/project/auth token validation
  disableLogger: true,

  // Automatically release
  automaticVercelMonitors: true,
};

// Wrap config: bundle analyzer first, then Sentry if configured.
const withAnalyzer = withBundleAnalyzer(nextConfig);
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withAnalyzer, sentryWebpackPluginOptions)
  : withAnalyzer;
