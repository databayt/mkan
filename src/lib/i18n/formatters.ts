import { localeConfig, type Locale } from '@/components/internationalization/config';

/** BCP-47 tag used for Intl number/date formatting of each app locale. */
export function intlLocale(locale: Locale): string {
  if (locale === 'ar') return 'ar-SA';
  if (locale === 'rw') return 'rw-RW';
  return 'en-US';
}

const MANUAL_CURRENCIES: Record<string, { ar: string }> = {
  SDG: { ar: 'ج.س' },
  RWF: { ar: 'فرنك رواندي' },
};

/**
 * Format a number as currency based on locale
 * @param amount - The amount to format
 * @param locale - The locale ('en', 'ar' or 'rw')
 * @param currency - ISO 4217 code; pass the listing's own `currency` (defaults to the locale's)
 */
export function formatCurrency(
  amount: number,
  locale: Locale,
  currency?: string
): string {
  const config = localeConfig[locale];
  const currencyCode = currency || config.currency;

  // SDG and RWF are formatted manually: Intl renders them as bare codes or
  // with locale-dependent symbols that read inconsistently across locales.
  // Both are whole-unit currencies (0 decimals). en/rw => "SDG 1,000" /
  // "RWF 45,000" (en-US grouping on purpose, so rw reads like en); ar =>
  // Arabic-Indic digits + a word/abbreviation suffix.
  const manual = MANUAL_CURRENCIES[currencyCode];
  if (manual) {
    const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-SD' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    return locale === 'ar' ? `${formatted} ${manual.ar}` : `${currencyCode} ${formatted}`;
  }

  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number based on locale
 * @param num - The number to format
 * @param locale - The locale ('en', 'ar' or 'rw')
 * @param options - Optional Intl.NumberFormat options
 */
export function formatNumber(
  num: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  const localeString = intlLocale(locale);
  return new Intl.NumberFormat(localeString, options).format(num);
}

/**
 * Format a date based on locale
 * @param date - The date to format
 * @param locale - The locale ('en', 'ar' or 'rw')
 * @param options - Optional Intl.DateTimeFormat options
 */
export function formatDate(
  date: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const localeString = intlLocale(locale);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };

  return new Intl.DateTimeFormat(localeString, defaultOptions).format(dateObj);
}

/**
 * Format a date with time based on locale
 * @param date - The date to format
 * @param locale - The locale ('en', 'ar' or 'rw')
 */
export function formatDateTime(
  date: Date | string,
  locale: Locale
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const localeString = intlLocale(locale);

  return new Intl.DateTimeFormat(localeString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
}

/**
 * Format time based on locale
 * @param date - The date/time to format
 * @param locale - The locale ('en', 'ar' or 'rw')
 */
export function formatTime(
  date: Date | string,
  locale: Locale
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const localeString = intlLocale(locale);

  return new Intl.DateTimeFormat(localeString, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
}

/**
 * Format relative time (e.g., "2 days ago", "in 3 hours")
 * @param date - The date to compare
 * @param locale - The locale ('en', 'ar' or 'rw')
 */
export function formatRelativeTime(
  date: Date | string,
  locale: Locale
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((dateObj.getTime() - now.getTime()) / 1000);

  const localeString = intlLocale(locale);
  const rtf = new Intl.RelativeTimeFormat(localeString, { numeric: 'auto' });

  // Calculate the appropriate unit
  const absSeconds = Math.abs(diffInSeconds);
  if (absSeconds < 60) {
    return rtf.format(Math.round(diffInSeconds), 'second');
  }
  if (absSeconds < 3600) {
    return rtf.format(Math.round(diffInSeconds / 60), 'minute');
  }
  if (absSeconds < 86400) {
    return rtf.format(Math.round(diffInSeconds / 3600), 'hour');
  }
  if (absSeconds < 2592000) {
    return rtf.format(Math.round(diffInSeconds / 86400), 'day');
  }
  if (absSeconds < 31536000) {
    return rtf.format(Math.round(diffInSeconds / 2592000), 'month');
  }
  return rtf.format(Math.round(diffInSeconds / 31536000), 'year');
}

/**
 * Get the date format pattern for a locale
 * @param locale - The locale ('en', 'ar' or 'rw')
 */
export function getDateFormatPattern(locale: Locale): string {
  return localeConfig[locale].dateFormat;
}

/**
 * Format a price range
 * @param min - Minimum price
 * @param max - Maximum price
 * @param locale - The locale ('en', 'ar' or 'rw')
 * @param currency - Optional currency code
 */
export function formatPriceRange(
  min: number,
  max: number,
  locale: Locale,
  currency?: string
): string {
  const minFormatted = formatCurrency(min, locale, currency);
  const maxFormatted = formatCurrency(max, locale, currency);

  if (min === max) {
    return minFormatted;
  }

  return locale === 'ar'
    ? `${minFormatted} - ${maxFormatted}`
    : `${minFormatted} - ${maxFormatted}`;
}

/**
 * Format a percentage based on locale
 * @param value - The decimal value (0.15 = 15%)
 * @param locale - The locale ('en', 'ar' or 'rw')
 */
export function formatPercentage(value: number, locale: Locale): string {
  const localeString = intlLocale(locale);
  return new Intl.NumberFormat(localeString, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}
