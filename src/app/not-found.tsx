import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { i18n, localeConfig, type Locale } from '@/components/internationalization/config';

// Translations for root-level 404 (fallback when [lang] isn't matched)
const notFoundTranslations = {
  en: {
    notFound: 'Page Not Found',
    goHome: 'Go Home',
  },
  ar: {
    notFound: 'الصفحة غير موجودة',
    goHome: 'الذهاب للرئيسية',
  },
} as const;

export default async function NotFound() {
  // Try to detect locale from cookie or accept-language header
  let locale: Locale = i18n.defaultLocale as Locale;

  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('NEXT_LOCALE')?.value as Locale | undefined;

    if (localeCookie && i18n.locales.includes(localeCookie)) {
      locale = localeCookie;
    } else {
      // Try accept-language header
      const headersList = await headers();
      const acceptLang = headersList.get('accept-language');
      if (acceptLang) {
        const preferredLocale = acceptLang.split(',')[0]?.split('-')[0] as Locale;
        if (preferredLocale && i18n.locales.includes(preferredLocale)) {
          locale = preferredLocale;
        }
      }
    }
  } catch {
    // Use default locale if cookies/headers aren't available
  }

  const config = localeConfig[locale];
  const t = notFoundTranslations[locale];

  return (
    <html lang={locale} dir={config.dir}>
      <body className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground">404</h1>
          <p className="mt-2 text-muted-foreground">{t.notFound}</p>
          <Link
            href={`/${locale}`}
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            {t.goHome}
          </Link>
        </div>
      </body>
    </html>
  );
}
