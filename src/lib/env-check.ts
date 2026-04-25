import { z } from 'zod';

/**
 * An empty string is a common Vercel dashboard drift for an "unset" variable.
 * Treat it as undefined for optional URL/email fields so the schema doesn't
 * reject a harmless blank on an optional service.
 */
const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().url().optional()
);
const optionalEmail = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().email().optional()
);
const optionalString = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().optional()
);

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
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  // Optional: ImageKit
  NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: optionalString,
  IMAGEKIT_PRIVATE_KEY: optionalString,
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: optionalUrl,

  // Optional: Email Service
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalEmail,

  // Optional: OAuth Providers
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  FACEBOOK_CLIENT_ID: optionalString,
  FACEBOOK_CLIENT_SECRET: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,

  // Optional: Stripe (required when ENABLE_PAYMENTS=true)
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLIC_KEY: optionalString,
  ENABLE_PAYMENTS: optionalString,

  // Optional: Google Translate v2 (required when ENABLE_CONTENT_TRANSLATION=true)
  GOOGLE_TRANSLATE_API_KEY: optionalString,
  ENABLE_CONTENT_TRANSLATION: optionalString,

  // Optional: Sudan payment rails (each behind its own flag)
  ENABLE_MTN_MOMO: optionalString,
  MTN_MOMO_API_KEY: optionalString,
  MTN_MOMO_SUBSCRIPTION_KEY: optionalString,
  MTN_MOMO_ENVIRONMENT: optionalString,
  ENABLE_BANKAK: optionalString,
  BANKAK_MERCHANT_ID: optionalString,
  BANKAK_API_KEY: optionalString,
  BANKAK_SIGNING_KEY: optionalString,
  ENABLE_BOK: optionalString,
  BOK_API_KEY: optionalString,
  BOK_MERCHANT_CODE: optionalString,

  // Cron job protection
  CRON_SECRET: optionalString,

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
 *   - **Production runtime**: log loudly, never throw. Throwing here runs
 *     at module load (auth.ts imports this eagerly), which crashes the
 *     entire serverless function with FUNCTION_INVOCATION_FAILED before
 *     any handler runs. A real missing `DATABASE_URL` will still surface
 *     at the first query with a clear Prisma error.
 *   - **Development / test**: warn and continue so a wiped `.env` shows
 *     up in the terminal but doesn't block iteration.
 */
export function validateEnv(): Env {
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';

  if (isBuildTime) {
    console.log('⏭️  Skipping strict env validation during build');
    return process.env as Env;
  }

  const result = envSchema.safeParse(process.env);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
    .join('\n');

  if (process.env.NODE_ENV === 'production') {
    console.error(`❌ Environment validation failed:\n${details}`);
    console.error('   Continuing boot; individual features depending on invalid vars will fail at use.');
    return process.env as Env;
  }

  console.warn(`⚠️  Environment validation warnings:\n${details}`);
  console.warn('   Dev continues, but production will log this as an error. Fix .env.');
  return process.env as Env;
}

/**
 * Wrapper that prints a success line when validation passes. Used for
 * startup diagnostics where the extra log is useful.
 */
export function validateEnvWithLogging(): Env {
  console.log('🔍 Validating environment variables...');
  const env = validateEnv();
  console.log('✅ Environment validation complete');
  return env;
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
  githubOAuth: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  stripe: Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY
  ),
  googleTranslate: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY),
  mtnMomo: Boolean(
    process.env.ENABLE_MTN_MOMO === 'true' &&
    process.env.MTN_MOMO_API_KEY &&
    process.env.MTN_MOMO_SUBSCRIPTION_KEY
  ),
  bankak: Boolean(
    process.env.ENABLE_BANKAK === 'true' &&
    process.env.BANKAK_MERCHANT_ID &&
    process.env.BANKAK_API_KEY
  ),
  bok: Boolean(
    process.env.ENABLE_BOK === 'true' &&
    process.env.BOK_API_KEY &&
    process.env.BOK_MERCHANT_CODE
  ),
} as const;

/**
 * Hard requirements that must be set when a feature flag is on. Logged at
 * boot so a misconfigured deploy surfaces the gap before a user hits it.
 */
export function checkFeatureFlagRequirements(): string[] {
  const errors: string[] = [];
  if (process.env.ENABLE_PAYMENTS === 'true' && !serviceStatus.stripe) {
    errors.push('ENABLE_PAYMENTS=true requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and NEXT_PUBLIC_STRIPE_PUBLIC_KEY');
  }
  if (process.env.ENABLE_CONTENT_TRANSLATION === 'true' && !serviceStatus.googleTranslate) {
    errors.push('ENABLE_CONTENT_TRANSLATION=true requires GOOGLE_TRANSLATE_API_KEY');
  }
  return errors;
}

// Log service status in development
if (process.env.NODE_ENV === 'development') {
  console.log('📦 Optional Services Status:');
  Object.entries(serviceStatus).forEach(([service, enabled]) => {
    console.log(`  ${enabled ? '✅' : '❌'} ${service}`);
  });
  const flagErrors = checkFeatureFlagRequirements();
  if (flagErrors.length > 0) {
    console.warn('⚠️  Feature flag requirements:');
    flagErrors.forEach((err) => console.warn(`   - ${err}`));
  }
}
