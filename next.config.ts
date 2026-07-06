import type { NextConfig } from "next";
import withBundleAnalyzerFactory from "@next/bundle-analyzer";

const withBundleAnalyzer = withBundleAnalyzerFactory({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Strict mode for better React development
  reactStrictMode: true,

  // Optional out-of-tree build dir (e.g. NEXT_DIST_DIR=.next-perf) so a
  // verification/analyze build can run while `next dev` owns .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  // PoweredByHeader removal for security
  poweredByHeader: false,

  // Compress responses
  compress: true,

  // Generate ETags for caching
  generateEtags: true,

  // Production source maps for error tracking
  productionBrowserSourceMaps: false, // Set to true if you need client-side source maps

  // Transpile packages that have issues with Turbopack
  transpilePackages: ["react-day-picker", "date-fns"],

  // Externalize server-only / ESM-only / native packages so the bundler
  // `require()`s them at runtime instead of bundling them — avoids Next 16's
  // `require() of ES Module` crashes and native-binary breakage on Vercel.
  serverExternalPackages: [
    "@react-pdf/renderer",
    // Prisma 7 + Neon serverless driver stack (server-only, native/ws deps)
    "@prisma/client",
    "@prisma/adapter-pg",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "pg",
    "ws",
    // Other server-only packages with native or heavy transitive deps
    "bcryptjs",
    "sanitize-html",
  ],

  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: "2mb",
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [],
    },
    // Optimize packages for server
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "date-fns",
      "react-day-picker",
      "lodash",
      "react-select",
      "mapbox-gl",
      "@radix-ui/react-popover",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-toast",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "via.placeholder.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
      },
      // ImageKit CDN
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
        port: "",
        pathname: "/**",
      },
      // AWS S3 and CloudFront
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.cloudfront.net",
        port: "",
        pathname: "/**",
      },
      // Google Photos/Drive
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
      // Facebook CDN
      {
        protocol: "https",
        hostname: "platform-lookaside.fbsbx.com",
        port: "",
        pathname: "/**",
      },
      // databayt CDN — airbnb assets (/airbnb) and mkan media (/mkan)
      {
        protocol: "https",
        hostname: "cdn.databayt.org",
        port: "",
        pathname: "/**",
      },
    ],
    // Low-bandwidth (Port Sudan mobile): AVIF first (~20-30% smaller than WebP),
    // trim device sizes to what phones/laptops actually need (drop 2048/3840,
    // add 360 for small phones), and cache optimized variants for a month.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    // Allow per-image quality below the 75 default — card grids ship q65,
    // which reads identically at card size but cuts ~25% more bytes.
    qualities: [50, 65, 75],
    minimumCacheTTL: 2678400,
    // Amenity/highlight glyphs on the CDN are SVG served through next/image;
    // allow it, locked down by CSP (no scripts, inline styles only).
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline';",
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

    return config;
  },

  // Headers configuration for security and caching
  async headers() {
    const headersList = [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
      {
        // The proxy (src/proxy.ts) short-circuits /api before its
        // addSecurityHeaders runs, so apply the static security headers here
        // declaratively. (CSP is page-oriented and unnecessary on JSON APIs.)
        source: "/api/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];

    if (process.env.NODE_ENV === "production") {
      headersList.push({
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      });
    }

    return headersList;
  },

  // Redirects for common patterns
  async redirects() {
    return [
      { source: "/home", destination: "/", permanent: true },
      { source: "/signin", destination: "/login", permanent: true },
      { source: "/signup", destination: "/register", permanent: true },
      // /searching remains redirected to /listings; /search is restored as a
      // standalone, server-filtered route (reads through searchListings, same
      // as /listings — see src/app/[lang]/search/page.tsx).
      {
        source: "/:lang(en|ar)/searching/:path*",
        destination: "/:lang/listings/:path*",
        permanent: true,
      },
      { source: "/:lang(en|ar)/searching", destination: "/:lang/listings", permanent: true },
    ];
  },
};

// Sentry was removed to fix a production `require() of ES Module`
// crash on Vercel. When Sentry's webpack plugin bundled @sentry/node
// server-side, it pulled in @opentelemetry/instrumentation (ESM-only),
// which Node's CJS loader rejected at first request, breaking every
// serverless invocation. No DSN was ever configured, so the integration
// wasn't actually capturing anything — safe to drop. Re-introduce via
// Next.js 16's `instrumentation.ts` pattern if needed.
export default withBundleAnalyzer(nextConfig);
