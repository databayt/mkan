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

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
});

const rubik = Rubik({
  subsets: ['arabic', 'latin'],
  variable: '--font-rubik',
  display: 'swap'
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:m-2"
        >
          {dictionary?.common?.skipToContent ?? 'Skip to main content'}
        </a>
        <Providers>
          <DictionaryProvider dictionary={dictionary}>
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