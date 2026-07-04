import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: [
        "src/lib/**/*.ts",
        "src/lib/**/*.tsx",
        "src/components/**/actions.ts",
      ],
      exclude: [
        "node_modules",
        "src/server",
        "tests",
        "**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: {
      // More specific first: "@/auth" must win over "@" (Vite matches in order),
      // otherwise "@/auth" rewrites to src/auth (which does not exist).
      "@/auth": path.resolve(__dirname, "./auth"),
      "@": path.resolve(__dirname, "./src"),
      // Next.js build-boundary guards — no-op under vitest (no bundler split).
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
      "client-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
