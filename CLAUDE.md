# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mkan is a rental marketplace application connecting tenants with property managers, built with an Airbnb-inspired design. It's a full-stack Next.js 15 application using TypeScript, Prisma ORM with PostgreSQL, and NextAuth for authentication.

## Essential Commands

### Development
```bash
pnpm dev                # Start development server with Turbopack on port 3000
pnpm dev:kill           # Kill port 3000 and start dev server
pnpm build             # Build for production (runs prisma generate first)
pnpm start             # Start production server on port 3000
pnpm lint              # Run ESLint
```

### Database & Seeding
```bash
pnpm prisma generate       # Generate Prisma client
pnpm prisma migrate dev    # Run database migrations
pnpm prisma studio         # Open Prisma Studio GUI
pnpm prisma db push        # Push schema changes without creating migrations
pnpm prisma db pull        # Pull schema from existing database
pnpm seed                  # Seed database (tsx seed.ts)
pnpm seed:listings         # Seed listings data (tsx scripts/seed-listings.ts)
```

### Internationalization (i18n)
The application supports multiple languages with custom i18n implementation:
- **Supported locales**: English (en, LTR), Arabic (ar, RTL)
- **Default locale**: English (en)
- Language files: `src/components/local/en.json`, `src/components/local/ar.json`
- Configuration: `src/components/local/config.ts` (includes RTL/LTR settings, date formats, currency)
- Middleware handles locale detection and automatic routing with locale prefix
- All non-API routes get locale prefix (e.g., `/en/dashboard`, `/ar/login`)
- Uses custom hooks (`use-locale.ts`) and dictionaries system

## Architecture & Project Structure

### Core Technologies
- **Framework**: Next.js 15 with App Router and React 19
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth v5 (beta) with Prisma adapter
- **Styling**: Tailwind CSS v4 with Radix UI components
- **State Management**: Redux Toolkit, Zustand, and React Context
- **Form Handling**: React Hook Form with Zod validation
- **File Uploads**: ImageKit integration with FilePond components
- **Rate Limiting**: Upstash Redis for API rate limiting
- **Error Tracking**: Sentry integration for production monitoring
- **Rich Text**: TipTap editor for content creation
- **Maps**: Leaflet and Mapbox GL for location services

### Directory Structure
```
src/
├── app/                  # Next.js App Router pages
│   ├── [lang]/          # Internationalized routes with locale parameter
│   ├── (auth)/          # Authentication pages (login, register, etc.)
│   ├── (dashboard)/     # Dashboard pages for managers/tenants
│   ├── (nondashboard)/  # Non-dashboard layout pages
│   ├── (site)/          # Public site pages
│   ├── host/            # Host-specific pages
│   ├── hosting/         # Hosting management pages
│   │   └── listings/editor/[id]/ # Listing editor with dynamic layout
│   └── api/             # API routes
│       ├── upload/      # File upload endpoints (ImageKit integration)
│       ├── auth/        # NextAuth API routes
│       ├── listings/    # Listing management APIs
│       └── health/      # Health check endpoint
├── components/          # React components
│   ├── ui/              # Shadcn UI components
│   ├── auth/            # Authentication components and utilities
│   ├── forms/           # Form components
│   ├── hosting/         # Hosting-related components
│   └── local/           # Internationalization components and utilities
├── lib/                 # Utility functions and configurations
│   ├── actions/         # Server actions (user-actions, application-actions)
│   ├── constants/       # App constants
│   ├── schemas.ts       # Zod validation schemas (property, application, settings)
│   ├── db.ts           # Database client
│   ├── imagekit.ts     # ImageKit configuration
│   ├── rate-limit.ts   # Upstash Redis rate limiting
│   └── sanitization.ts # Content sanitization utilities
├── hooks/              # Custom React hooks (auth-redirect, image-upload)
└── types/              # TypeScript type definitions
```

### Key Architectural Patterns

1. **Route Groups**: Uses Next.js route groups `(auth)`, `(dashboard)`, `(nondashboard)`, `(site)` for layout organization without affecting URL structure

2. **Authentication Flow**:
   - Configured in `auth.ts` (main config) and `auth.config.ts` (provider config)
   - Supports OAuth providers (Google, Facebook) and credential-based authentication
   - Two-factor authentication support with email verification
   - Role-based access control (ADMIN, USER, MANAGER, TENANT)
   - Uses NextAuth v5 (beta) with Prisma adapter and JWT strategy
   - Session tracking with `lastLogin` field for security auditing
   - Email verification required for credential-based logins
   - Secure cookie configuration with different settings per environment

3. **Database Schema**:
   - Uses Prisma with PostgreSQL
   - Schema defined in `prisma/schema.prisma`
   - Enums for UserRole, Highlight, Amenity, PropertyType, ApplicationStatus, PaymentStatus
   - Core models: User, Listing, Tenant, Application, Lease, Payment, Location
   - Support for authentication models (Account, Session, VerificationToken, etc.)

4. **Server Actions**: Located in `src/lib/actions/` for database operations

5. **Component Organization**:
   - Shadcn UI components in `src/components/ui/`
   - Feature-specific components grouped by domain
   - Shared components at root of components directory

### Path Aliases
- `@/*` → `./src/*` (for all source files)
- `@/auth` → `./auth` (for root-level auth.ts and auth.config.ts files)

## Important Configuration Notes

### Middleware & Security
- **Middleware** (`src/middleware.ts`) handles:
  - Locale detection and routing (adds locale prefix to all non-API routes)
  - Authentication checks for protected routes
  - Role-based access control (MANAGER, TENANT, ADMIN routes)
  - Rate limiting for API routes with tiered limits
  - CSRF protection for state-changing requests
  - Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Protected route groups**: `/dashboard`, `/managers`, `/tenants`, `/hosting`, `/host`
- **Security features**:
  - Production-only strict CSP and HSTS headers
  - Origin validation for non-GET requests
  - Rate limit headers in API responses
  - Secure cookie settings per environment

### Build Configuration
- **ESLint errors are ignored during builds** (`ignoreDuringBuilds: true`)
- **TypeScript errors are ignored during builds** (`ignoreBuildErrors: true`)
- These settings allow builds to complete with errors - use with caution
- Build process runs `prisma generate` automatically

### Image Domains
Configured to allow images from:
- images.unsplash.com, unsplash.com
- via.placeholder.com, picsum.photos
- ik.imagekit.io (ImageKit CDN)
- *.amazonaws.com, *.cloudfront.net (AWS)
- lh3.googleusercontent.com (Google)
- platform-lookaside.fbsbx.com (Facebook)

### Environment Variables
Required environment variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - NextAuth secret
- `NEXTAUTH_URL` - Application URL
- OAuth provider credentials (if using OAuth)
- `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` - ImageKit public key
- `IMAGEKIT_PRIVATE_KEY` - ImageKit private key
- `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` - ImageKit URL endpoint
- `RESEND_API_KEY` - Resend API key for email service (optional)
- `EMAIL_FROM` - Email sender address (optional)
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL for rate limiting
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` - Sentry configuration (optional)

## Development Workflow

1. **Before making changes**: Understand existing patterns by examining similar components/features
2. **Follow conventions**: Match existing code style, imports, and patterns
3. **Database changes**: Use Prisma migrations (`pnpm prisma migrate dev`)
4. **Type safety**: Project uses strict TypeScript - ensure proper typing
5. **Authentication**:
   - Use `auth()` from `@/auth` for server-side session checks
   - Use auth utilities in `src/components/auth/` for user operations
   - Protected routes configured in `src/middleware.ts`
6. **Forms**: Use React Hook Form with Zod schemas (see `src/lib/schemas.ts`)
   - Available schemas: propertySchema, applicationSchema, settingsSchema
   - Form validation includes property creation, applications, and user settings
7. **File Uploads**: Use ImageKit integration with FilePond components for image handling
   - Configuration in `src/lib/imagekit.ts`
   - Upload API routes in `src/app/api/upload/`
8. **Internationalization**:
   - All routes should work with locale prefix (e.g., `/en/`, `/ar/`)
   - Use the custom i18n system in `src/components/local/`
   - Use `useLocale()` hook for accessing current locale
   - Consider RTL layout for Arabic locale
9. **Rate Limiting**:
   - API routes use Upstash Redis for tiered rate limiting
   - Different limits for auth (10/min), upload (5/min), search (30/min), payment (5/min), general API (20/min)
   - Configured in `src/lib/rate-limit.ts` with fallback for development

## Testing
Currently no test framework is configured. Consider adding tests before major changes.

## Deployment Notes
- Production builds require all Prisma migrations to be applied
- Environment variables must be properly configured
- Uses Turbopack in development for faster builds