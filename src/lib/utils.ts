import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from "sonner"
import type { Locale } from '@/components/internationalization/config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const cleanParams = (params: Record<string, any>) => {
  const cleaned: Record<string, any> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      cleaned[key] = value;
    }
  });
  return cleaned;
};

export const formatEnumString = (enumValue: string): string => {
  return enumValue
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .trim(); // Remove any leading/trailing spaces
};

export const formatPriceValue = (
  price: number | null | undefined,
  isMin: boolean,
  locale: Locale = 'en',
  labels?: { anyMin?: string; anyMax?: string }
): string => {
  if (!price || price === 0) {
    return isMin ? (labels?.anyMin ?? "Any Min Price") : (labels?.anyMax ?? "Any Max Price");
  }

  const currency = locale === 'ar' ? 'ج.س' : 'SDG';
  // Round the abbreviated form: SDG prices are five and six figures now, and
  // 36,750 rendered as "36.75k" — three digits of precision nobody reads on a
  // filter option. One decimal keeps 17,500 as "17.5k" and collapses the rest.
  const thousands = price / 1000;
  const value =
    price >= 1000
      ? `${Number.isInteger(thousands) ? thousands : Math.round(thousands * 10) / 10}k`
      : `${price}`;

  if (isMin) return `${currency} ${value}+`;
  // "<" ahead of Arabic text lands on the wrong side of the number under the
  // bidi algorithm, so Arabic gets the word instead of the symbol.
  return locale === 'ar' ? `حتى ${currency} ${value}` : `< ${currency} ${value}`;
};

export const withToast = async (
  promise: Promise<any>,
  messages: { success?: string; error?: string }
) => {
  try {
    const result = await promise;
    if (messages.success) {
      toast.success(messages.success);
    }
    return result;
  } catch (error: any) {
    if (messages.error) {
      toast.error(messages.error);
    }
    throw error;
  }
};

