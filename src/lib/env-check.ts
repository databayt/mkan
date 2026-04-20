import { z } from 'zod';

/**
 * Environment variable schema for validation
 * Ensures all required configuration is present and valid
 */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),

  // NextAuth
  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters for security'),
  NEXTAUTH_URL: z
    .string()
    .url('NEXTAUTH_URL must be a valid URL')
    .refine(
      (url) => {
        if (process.env.NODE_ENV === 'production') {
          return url.startsWith('https://');
        }
        return true;
      },
      { message: 'NEXTAUTH_URL must use HTTPS in production' }
    ),

  // Redis (Upstash) - Optional, used for rate limiting
  UPSTASH_REDIS_REST_URL: z.string().url('UPSTASH_REDIS_REST_URL must be a valid URL').optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required').optional(),

  // Optional: ImageKit
  NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: z.string().optional(),
  IMAGEKIT_PRIVATE_KEY: z.string().optional(),
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: z.string().url().optional(),

  // Optional: Email Service
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Optional: OAuth Providers
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

  // Optional: Sentry
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables at runtime.
 *
 * Behavior by phase:
 *   - **Build phase** (`NEXT_PHASE=phase-production-build`): skip; env is
 *     injected at runtime on Vercel, so build-time validation gives false
 *     negatives.
 *   - **Production runtime**: fail fast with a descriptive error listing
 *     which vars failed — silent boot-with-undefined caused a production
 *     incident on 2026-04-20 where `DATABASE_URL` was missing and every
 *     page returned 500 from `PrismaClientConstructorValidationError`.
 *   - **Development / test**: log the errors and continue, so a wiped
 *     `.env` in dev is visible in the terminal rather than hidden.
 */
export function validateEnv(): Env {
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

  if (isBuildTime) {
    console.log('⏭️  Skipping strict env validation during build');
    return process.env as Env;
  }

  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;

    const details = error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    const message = `Environment validation failed:\n${details}`;

    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ ${message}`);
      throw new Error(message);
    }

    console.warn(`⚠️  ${message}`);
    console.warn('   Dev continues, but production boot would fail. Fix .env.');
    return process.env as Env;
  }
}

/**
 * Validates environment variables with detailed logging
 * Useful during build time for better error messages
 */
export function validateEnvWithLogging(): Env {
  console.log('🔍 Validating environment variables...');

  try {
    const env = validateEnv();
    console.log('✅ Environment validation passed');
    return env;
  } catch (error) {
    console.error('❌ Environment validation failed:');
    console.error(error instanceof Error ? error.message : String(error));

    if (process.env.NODE_ENV === 'production') {
      throw error; // Fail fast in production
    } else {
      console.warn('⚠️  Continuing in development mode despite validation errors');
      console.warn('   Fix these issues before deploying to production!');
      return process.env as Env; // Allow development to continue with warnings
    }
  }
}

/**
 * Check if optional services are configured
 */
export const serviceStatus = {
  imageKit: Boolean(
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY &&
    process.env.IMAGEKIT_PRIVATE_KEY &&
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT
  ),
  email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  facebookOAuth: Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET),
  sentry: Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT),
} as const;

// Log service status in development
if (process.env.NODE_ENV === 'development') {
  console.log('📦 Optional Services Status:');
  Object.entries(serviceStatus).forEach(([service, enabled]) => {
    console.log(`  ${enabled ? '✅' : '❌'} ${service}`);
  });
}
