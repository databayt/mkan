import { localeConfig, type Locale } from '@/components/internationalization/config';

/**
 * Format a number as currency based on locale
 * @param amount - The amount to format
 * @param locale - The locale ('en' or 'ar')
 * @param currency - Optional override currency (defaults to locale's currency)
 */
export function formatCurrency(
  amount: number,
  locale: Locale,
  currency?: string
): string {
  const config = localeConfig[locale];
  const currencyCode = currency || config.currency;

  // For SDG (Sudanese Pound), format manually since Intl doesn't support it well
  if (currencyCode === 'SDG') {
    const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-SD' : 'en-SD', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    return locale === 'ar' ? `${formatted} ج.س` : `SDG ${formatted}`;
  }

  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number based on locale
 * @param num - The number to format
 * @param locale - The locale ('en' or 'ar')
 * @param options - Optional Intl.NumberFormat options
 */
export function formatNumber(
  num: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  const localeString = locale === 'ar' ? 'ar-SA' : 'en-US';
  return new Intl.NumberFormat(localeString, options).format(num);
}

/**
 * Format a date based on locale
 * @param date - The date to format
 * @param locale - The locale ('en' or 'ar')
 * @param options - Optional Intl.DateTimeFormat options
 */
export function formatDate(
  date: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const localeString = locale === 'ar' ? 'ar-SA' : 'en-US';

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
 * @param locale - The locale ('en' or 'ar')
 */
export function formatDateTime(
  date: Date | string,
  locale: Locale
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const localeString = locale === 'ar' ? 'ar-SA' : 'en-US';

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
 * @param locale - The locale ('en' or 'ar')
 */
export function formatTime(
  date: Date | string,
  locale: Locale
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const localeString = locale === 'ar' ? 'ar-SA' : 'en-US';

  return new Intl.DateTimeFormat(localeString, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
}

/**
 * Format relative time (e.g., "2 days ago", "in 3 hours")
 * @param date - The date to compare
 * @param locale - The locale ('en' or 'ar')
 */
export function formatRelativeTime(
  date: Date | string,
  locale: Locale
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((dateObj.getTime() - now.getTime()) / 1000);

  const localeString = locale === 'ar' ? 'ar-SA' : 'en-US';
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
 * @param locale - The locale ('en' or 'ar')
 */
export function getDateFormatPattern(locale: Locale): string {
  return localeConfig[locale].dateFormat;
}

/**
 * Format a price range
 * @param min - Minimum price
 * @param max - Maximum price
 * @param locale - The locale ('en' or 'ar')
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
 * @param locale - The locale ('en' or 'ar')
 */
export function formatPercentage(value: number, locale: Locale): string {
  const localeString = locale === 'ar' ? 'ar-SA' : 'en-US';
  return new Intl.NumberFormat(localeString, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}
