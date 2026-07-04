// Stub for Next.js's `server-only` / `client-only` guard packages.
// They exist purely to throw at build time if a server/client module is
// imported into the wrong bundle. Under vitest there is no bundler boundary,
// so we alias them to this empty module (see vitest.config.ts `resolve.alias`).
export {};
