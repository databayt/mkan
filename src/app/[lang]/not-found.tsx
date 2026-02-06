import Link from 'next/link';
import { getDictionary } from '@/components/internationalization/dictionaries';
import { localeConfig, type Locale } from '@/components/internationalization/config';

interface NotFoundProps {
  params: Promise<{ lang: Locale }>;
}

export default async function NotFound({ params }: NotFoundProps) {
  // Default to 'en' if params aren't available (edge case)
  let lang: Locale = 'en';
  let dir: 'ltr' | 'rtl' = 'ltr';

  try {
    const resolvedParams = await params;
    lang = resolvedParams?.lang || 'en';
    dir = localeConfig[lang]?.dir || 'ltr';
  } catch {
    // Use defaults
  }

  const dictionary = await getDictionary(lang);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background" dir={dir}>
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-muted-foreground">{dictionary.errors.notFound}</p>
        <Link
          href={`/${lang}`}
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          {dictionary.errors.goHome}
        </Link>
      </div>
    </div>
  );
}
