import type { Metadata } from 'next';
import { preconnect } from 'react-dom';
import { Inter, Rubik } from 'next/font/google';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { DictionaryProvider } from '@/components/internationalization/dictionary-context';
import { type Locale, localeConfig, i18n } from '@/components/internationalization/config';
import { Providers } from '../providers';
import { Toaster } from 'sonner';
import { CookieBanner } from '@/components/consent/cookie-banner';
import { ConsentAwareAnalytics } from '@/components/consent/consent-aware-analytics';
import { AvailabilityPrompt } from '@/components/hosting/availability-prompt';
import '../globals.css';

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

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

const rubik = Rubik({
  subsets: ['arabic', 'latin'],
  variable: '--font-rubik',
  display: 'optional'
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

  return (
    <html lang={lang} dir={config.dir} suppressHydrationWarning>
      <body
        className={`${isRTL ? rubik.className : inter.className} ${inter.variable} ${rubik.variable} antialiased`}
      >
        {/* Pre-paint consent gate: the cookie banner is part of the server
            HTML so it paints with the page (a post-hydration mount made it
            the LCP element at ~10s on slow phones). This parser-blocking
            pair hides it before first paint for visitors who already chose —
            no flash in either direction. <html> carries
            suppressHydrationWarning, so the stamped attribute is benign. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(document.cookie.indexOf('cookieConsent=')!==-1)document.documentElement.setAttribute('data-consent','1')}catch(e){}",
          }}
        />
        <style>{`html[data-consent="1"] [data-cookie-banner]{display:none}`}</style>
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
            <CookieBanner />
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