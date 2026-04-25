import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Mkan ESLint flat config.
 *
 * Phase 0 posture: toolchain must run cleanly; legacy rule violations are
 * demoted to warnings to unblock CI and surface issues for Phase 4 cleanup.
 * Only rules that catch runtime correctness bugs stay at error level.
 */
export default [
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".source/**",
      "next-env.d.ts",
      "src/generated/**",
      "prisma/migrations/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-unnecessary-type-constraint": "warn",
      "@typescript-eslint/no-wrapper-object-types": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@next/next/no-img-element": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/component-hook-factories": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/config": "warn",
      "react-hooks/fbt": "warn",
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
      "import/no-anonymous-default-export": "warn",
      "jsx-a11y/alt-text": "warn",
      "prefer-const": "warn",
      "react-hooks/rules-of-hooks": "error",
      "@next/next/no-duplicate-head": "error",
    },
  },
];
