import "@testing-library/jest-dom/vitest";

// Stub env vars that downstream modules read at import time. Tests should
// not require real Resend / Stripe / Upstash credentials; using safe
// placeholders here keeps individual specs free of process.env mutation.
process.env.RESEND_API_KEY ??= "test_resend_key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.EMAIL_FROM ??= "test@example.com";

