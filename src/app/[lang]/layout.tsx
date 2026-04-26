import type { Metadata, Viewport } from 'next';
import { Inter, Rubik } from 'next/font/google';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { DictionaryProvider } from '@/components/internationalization/dictionary-context';
import { type Locale, localeConfig, i18n } from '@/components/internationalization/config';
import { ReportIssue } from '@/components/report-issue';
import { Providers } from '../providers';
import { Toaster } from 'sonner';
import '../globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

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
  const lang = (resolvedParams.lang as Locale) || 'en';
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
      }), { 'x-default': '/en' }),
    },
    other: {
      'accept-language': lang,
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
  const lang = (resolvedParams.lang as Locale) || 'en';
  const config = localeConfig[lang] || localeConfig['en'];
  const isRTL = config.dir === 'rtl';
  const dictionary = await getDictionary(lang);

  return (
    <html lang={lang} dir={config.dir} suppressHydrationWarning>
      <body
        className={`${isRTL ? rubik.className : inter.className} ${inter.variable} ${rubik.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:m-2"
        >
          {dictionary.common.skipToContent}
        </a>
        <Providers>
          <DictionaryProvider dictionary={dictionary}>
            {children}
            <Toaster richColors />
            <div className="fixed end-4 bottom-4 z-40 print:hidden">
              <ReportIssue variant="icon" />
            </div>
          </DictionaryProvider>
        </Providers>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
}