import type { Metadata, Viewport } from 'next';
import { preconnect } from 'react-dom';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { DictionaryProvider } from '@/components/internationalization/dictionary-context';
import { type Locale, localeConfig, i18n } from '@/components/internationalization/config';
import { Providers } from '../providers';
import { Toaster } from 'sonner';
import { PHASE1 } from '@/config/phase-flags';
import { CookieBanner } from '@/components/consent/cookie-banner';
import { ConsentAwareAnalytics } from '@/components/consent/consent-aware-analytics';
import { AvailabilityPrompt } from '@/components/hosting/availability-prompt';
import '../globals.css';

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// display:'optional' (not 'swap'): on slow connections the webfont arrives
// seconds after first paint, and the swap re-inflated the text ~30% — which
// re-set LCP to font-arrival time (~10s on Slow 4G) and caused the only CLS
// on the page. With 'optional' the first slow visit keeps next/font's
// size-adjusted system fallback (no reflow, no late LCP entry) and the font,
// cached in the background, applies from the second view on. Fast connections
// still get it on first paint.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'optional'
});

// Thmanyah (خط ثمانية) — the Arabic UI face, mirrored from hogwarts.
// Self-hosted from src/fonts/thmanyah/ (fetched on predev/build by
// scripts/fetch-thmanyah.mjs; license forbids redistribution so the woff2
// files are git-ignored). Uses the "serif text" family (Thmanyah's
// running-text serif), not the sans. Same display:'optional' rationale as
// Inter above — Arabic is the default locale on the slowest connections.
const thmanyahText = localFont({
  src: [
    { path: '../../fonts/thmanyah/thmanyah-serif-text-300.woff2', weight: '300' },
    { path: '../../fonts/thmanyah/thmanyah-serif-text-400.woff2', weight: '400' },
    { path: '../../fonts/thmanyah/thmanyah-serif-text-500.woff2', weight: '500' },
    { path: '../../fonts/thmanyah/thmanyah-serif-text-700.woff2', weight: '700' },
    { path: '../../fonts/thmanyah/thmanyah-serif-text-900.woff2', weight: '900' },
  ],
  variable: '--font-thmanyah-text',
  display: 'optional',
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const lang = (resolvedParams.lang as Locale) || 'ar';
  const dictionary = await getDictionary(lang);

  return {
    title: {
      default: 'Mkan - Rental Marketplace',
      template: '%s | Mkan'
    },
    description: 'Connect with property managers and find your perfect rental home',
    alternates: {
      languages: Object.keys(localeConfig).reduce((acc, locale) => ({
        ...acc,
        [locale]: `/${locale}`,
      }), { 'x-default': '/ar' }),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const resolvedParams = await params;
  const lang = (resolvedParams.lang as Locale) || 'ar';
  const config = localeConfig[lang] || localeConfig['ar'];
  const isRTL = config.dir === 'rtl';
  const dictionary = await getDictionary(lang);

  // Videos, glyph SVGs, and posters load straight from the CDN (not via
  // /_next/image) — open the connection early, it matters on high-RTT links.
  preconnect(`https://${process.env.NEXT_PUBLIC_CDN_DOMAIN?.trim() || 'cdn.databayt.org'}`);

  // Font variable classes live on <html> so the :root[dir="rtl"] token
  // override in globals.css can resolve them.
  return (
    <html
      lang={lang}
      dir={config.dir}
      className={`${inter.variable} ${thmanyahText.variable}`}
      suppressHydrationWarning
    >
      <body
        className={`${isRTL ? thmanyahText.className : inter.className} antialiased`}
      >
        {/* Pre-paint consent gate: the cookie banner is part of the server
            HTML so it paints with the page (a post-hydration mount made it
            the LCP element at ~10s on slow phones). This parser-blocking
            pair hides it before first paint for visitors who already chose —
            no flash in either direction. <html> carries
            suppressHydrationWarning, so the stamped attribute is benign. */}
        {PHASE1.showCookieBanner && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html:
                  "try{if(document.cookie.indexOf('cookieConsent=')!==-1)document.documentElement.setAttribute('data-consent','1')}catch(e){}",
              }}
            />
            {/* i18n-exempt — CSS rule for the consent gate, not user-facing copy */}
            <style>{`html[data-consent="1"] [data-cookie-banner]{display:none}`}</style>
          </>
        )}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:m-2"
        >
          {dictionary?.common?.skipToContent ?? 'Skip to main content'}
        </a>
        <Providers>
          <DictionaryProvider lang={lang}>
            {children}
            <Toaster richColors />
            {PHASE1.showCookieBanner && <CookieBanner />}
            <AvailabilityPrompt />
            <ConsentAwareAnalytics />
          </DictionaryProvider>
        </Providers>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}