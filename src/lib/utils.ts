import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from "sonner"

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

export const formatPriceValue = (price: number | null | undefined, isMin: boolean): string => {
  if (!price || price === 0) {
    return isMin ? "Any Min Price" : "Any Max Price";
  }
  
  if (price >= 1000) {
    const kValue = price / 1000;
    return isMin ? `$${kValue}k+` : `<$${kValue}k`;
  }
  
  return isMin ? `$${price}+` : `<$${price}`;
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

