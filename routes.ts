/**
 * Routes that are accessible to the public without authentication.
 * Paths are WITHOUT locale prefix — middleware strips locale before matching.
 * @type {string[]}
 */
export const publicRoutes = [
  "/",
  "/listings",
  "/search",
  "/transport",
  "/transport/search",
  "/transport/offices",
  "/transport/trips",
  "/accessibility",
  "/cookies",
  "/privacy",
  "/terms",
  "/help",
  "/landing",
  "/host",
  "/transport-host",
  "/dev/credentials",
  "/new-verification",
];

/**
 * Routes used for authentication.
 * Logged-in users hitting these will be redirected to DEFAULT_LOGIN_REDIRECT.
 * Paths are WITHOUT locale prefix.
 * @type {string[]}
 */
export const authRoutes = [
  "/login",
  "/join",
  "/register",
  "/error",
  "/reset",
  "/new-password",
  "/new-verification",
];

/**
 * Route prefixes that ALWAYS require authentication.
 * Any path starting with one of these prefixes is protected.
 * @type {string[]}
 */
export const protectedPrefixes = [
  "/admin",
  "/dashboard",
  "/managers",
  "/tenants",
  "/offices",
  "/hosting",
  "/host/",
  "/transport-host/",
  "/verify-listing",
];

/**
 * The prefix for API authentication routes.
 * Routes starting with this prefix are used for API authentication purposes.
 * @type {string}
 */
export const apiAuthPrefix = "/api/auth";

/**
 * The default redirect path after logging in.
 * @type {string}
 */
export const DEFAULT_LOGIN_REDIRECT = "/hosting/listings";
