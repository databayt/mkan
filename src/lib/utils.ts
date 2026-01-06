import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Stub function for unused AddHomeForm component
export function generateRandomNumber(min: number = 0, max: number = 1000000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Stub function for unused HomeCard component
export function getImageUrl(path: string | null | undefined): string {
  if (!path) return '/api/placeholder/303/287';
  if (path.startsWith('http')) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/${path}`;
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

// This function will be used to create user records in the database
// It will be called from the API when a user doesn't exist
export const createNewUserInDatabase = async (
  user: any,
  userRole: string,
  fetchWithBQ: any
) => {
  const createEndpoint = userRole?.toLowerCase() === "manager" 
    ? "/managers" 
    : "/tenants";

  const createUserResponse = await fetchWithBQ({
    url: createEndpoint,
    method: "POST",
    body: {
      // For NextAuth.js, we'll use the user ID as the key
      // Note: The backend may need to be updated to accept 'userId' instead of 'cognitoId'
      cognitoId: user.id,
      name: user.name || user.email?.split('@')[0] || '',
      email: user.email || "",
      phoneNumber: "",
    },
  });
  
  return createUserResponse;
};
