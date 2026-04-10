import en from '@/components/internationalization/en.json';
import ar from '@/components/internationalization/ar.json';

const dictionaries = { en, ar } as const;

export type TransportLocale = 'en' | 'ar';

export function getTransportDictionary(locale: string) {
  const key = (locale === 'ar' ? 'ar' : 'en') as TransportLocale;
  return dictionaries[key].transport;
}
