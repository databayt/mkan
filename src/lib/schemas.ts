import * as z from "zod";
import { PropertyTypeEnum, AmenityEnum, HighlightEnum } from "@/lib/constants";

// ============================================
// LISTING SCHEMAS
// ============================================

export const listingSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title must be 100 characters or less"),
  description: z.string().min(10, "Description must be at least 10 characters").max(5000, "Description must be 5000 characters or less"),
  pricePerNight: z.coerce.number().positive("Price must be positive").min(1, "Minimum price is $1"),
  securityDeposit: z.coerce.number().min(0, "Security deposit cannot be negative").optional(),
  applicationFee: z.coerce.number().min(0, "Application fee cannot be negative").optional(),
  isPetsAllowed: z.boolean().default(false),
  isParkingIncluded: z.boolean().default(false),
  instantBook: z.boolean().default(false),
  photoUrls: z.array(z.string().url()).min(1, "At least one photo is required"),
  amenities: z.array(z.nativeEnum(AmenityEnum)).default([]),
  highlights: z.array(z.nativeEnum(HighlightEnum)).default([]),
  bedrooms: z.coerce.number().int().min(0).max(50, "Maximum 50 bedrooms"),
  bathrooms: z.coerce.number().min(0).max(50, "Maximum 50 bathrooms"),
  squareFeet: z.coerce.number().int().positive().optional(),
  guestCount: z.coerce.number().int().min(1, "At least 1 guest").max(50, "Maximum 50 guests").default(2),
  propertyType: z.nativeEnum(PropertyTypeEnum),
  // Location fields
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export type ListingFormData = z.infer<typeof listingSchema>;

// Partial schema for updates
export const listingUpdateSchema = listingSchema.partial();
export type ListingUpdateFormData = z.infer<typeof listingUpdateSchema>;

// Legacy property schema (for backwards compatibility)
export const propertySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  pricePerNight: z.coerce.number().positive().min(0).int(),
  securityDeposit: z.coerce.number().positive().min(0).int(),
  applicationFee: z.coerce.number().positive().min(0).int(),
  isPetsAllowed: z.boolean(),
  isParkingIncluded: z.boolean(),
  photoUrls: z
    .array(z.instanceof(File))
    .min(1, "At least one photo is required"),
  amenities: z.string().min(1, "Amenities are required"),
  highlights: z.string().min(1, "Highlights are required"),
  beds: z.coerce.number().positive().min(0).max(10).int(),
  baths: z.coerce.number().positive().min(0).max(10).int(),
  squareFeet: z.coerce.number().int().positive(),
  propertyType: z.nativeEnum(PropertyTypeEnum),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
  postalCode: z.string().min(1, "Postal code is required"),
});

export type PropertyFormData = z.infer<typeof propertySchema>;

// ============================================
// APPLICATION SCHEMAS
// ============================================

export const applicationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
  message: z.string().max(1000, "Message must be 1000 characters or less").optional(),
  propertyId: z.coerce.number().int().positive().optional(),
});

export type ApplicationFormData = z.infer<typeof applicationSchema>;

// ============================================
// LEASE SCHEMAS
// ============================================

export const leaseSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  rent: z.coerce.number().positive("Rent must be positive"),
  deposit: z.coerce.number().min(0, "Deposit cannot be negative"),
  propertyId: z.coerce.number().int().positive(),
  tenantId: z.string().min(1, "Tenant is required"),
}).refine((data) => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

export type LeaseFormData = z.infer<typeof leaseSchema>;

// ============================================
// PAYMENT SCHEMAS
// ============================================

export const paymentStatusEnum = z.enum(["Pending", "Paid", "PartiallyPaid", "Overdue"]);

export const paymentSchema = z.object({
  amountDue: z.coerce.number().positive("Amount due must be positive"),
  amountPaid: z.coerce.number().min(0, "Amount paid cannot be negative"),
  dueDate: z.coerce.date(),
  paymentDate: z.coerce.date().optional(),
  paymentStatus: paymentStatusEnum,
  leaseId: z.coerce.number().int().positive(),
});

export type PaymentFormData = z.infer<typeof paymentSchema>;

// ============================================
// REVIEW SCHEMAS
// ============================================

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Rating must be at least 1").max(5, "Rating must be at most 5"),
  comment: z.string().min(10, "Review must be at least 10 characters").max(2000, "Review must be 2000 characters or less"),
  listingId: z.coerce.number().int().positive(),
});

export type ReviewFormData = z.infer<typeof reviewSchema>;

export const hostReplySchema = z.object({
  reviewId: z.string().min(1, "Review ID is required"),
  hostReply: z.string().min(10, "Reply must be at least 10 characters").max(1000, "Reply must be 1000 characters or less"),
});

export type HostReplyFormData = z.infer<typeof hostReplySchema>;

// ============================================
// SETTINGS SCHEMAS
// ============================================

export const settingsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  phoneNumber: z.string().min(10, "Phone number must be at least 10 digits"),
});

export type SettingsFormData = z.infer<typeof settingsSchema>;

// ============================================
// SEARCH SCHEMAS
// ============================================

export const searchFiltersSchema = z.object({
  location: z.string().optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  bathrooms: z.coerce.number().min(0).optional(),
  guestCount: z.coerce.number().int().min(1).optional(),
  propertyType: z.nativeEnum(PropertyTypeEnum).optional(),
  amenities: z.array(z.nativeEnum(AmenityEnum)).optional(),
  instantBook: z.boolean().optional(),
  checkIn: z.coerce.date().optional(),
  checkOut: z.coerce.date().optional(),
}).refine((data) => {
  if (data.priceMin && data.priceMax) {
    return data.priceMax >= data.priceMin;
  }
  return true;
}, {
  message: "Max price must be greater than or equal to min price",
  path: ["priceMax"],
}).refine((data) => {
  if (data.checkIn && data.checkOut) {
    return data.checkOut > data.checkIn;
  }
  return true;
}, {
  message: "Check-out must be after check-in",
  path: ["checkOut"],
});

export type SearchFiltersFormData = z.infer<typeof searchFiltersSchema>;

// ============================================
// BOOKING SCHEMAS
// ============================================

export const bookingSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  checkIn: z.coerce.date(),
  checkOut: z.coerce.date(),
  guestCount: z.coerce.number().int().min(1, "At least 1 guest required"),
  totalPrice: z.coerce.number().positive(),
  specialRequests: z.string().max(500, "Special requests must be 500 characters or less").optional(),
}).refine((data) => data.checkOut > data.checkIn, {
  message: "Check-out must be after check-in",
  path: ["checkOut"],
});

export type BookingFormData = z.infer<typeof bookingSchema>;
