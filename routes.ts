/**
 * An array of routes that are accessible to the public
 * These routes do not require authentication
 * @type {string[]}
 */
export const publicRoutes = [
  "/",
  "/en",
  "/ar",
  "/en/listings",
  "/ar/listings",
  "/en/search",
  "/ar/search",
  "/en/help",
  "/ar/help",
  "/new-verification",
  "/en/new-verification",
  "/ar/new-verification",
  "/admin",
  "/client",
  "/server",
  "/setting",
  "/dashboard/properties/new"
];

/**
 * An array of routes that are used for authentication
 * These routes will redirect logged in users to /settings
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
  "/en/login",
  "/ar/login",
  "/en/join",
  "/ar/join",
  "/en/register",
  "/ar/register",
  "/en/error",
  "/ar/error",
  "/en/reset",
  "/ar/reset",
  "/en/new-password",
  "/ar/new-password",
  "/en/new-verification",
  "/ar/new-verification"
];

/**
 * The prefix for API authentication routes
 * Routes that start with this prefix are used for API authentication purposes
 * @type {string}
 */
export const apiAuthPrefix = "/api/auth";

/**
 * The default redirect path after logging in
 * @type {string}
 */
export const DEFAULT_LOGIN_REDIRECT = "/managers/properties";