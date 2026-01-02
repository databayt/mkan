import * as z from 'zod';

// ============================================
// BUS AMENITIES ENUM
// ============================================

export const BUS_AMENITIES = [
  'AirConditioning',
  'WiFi',
  'USB',
  'LegRoom',
  'Toilet',
  'Refreshments',
  'Entertainment',
  'Luggage',
  'Reclining',
] as const;

export type BusAmenity = (typeof BUS_AMENITIES)[number];

// ============================================
// TRANSPORT OFFICE SCHEMAS
// ============================================

export const transportOfficeSchema = z.object({
  name: z.string().min(2, 'Office name must be at least 2 characters'),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  phone: z.string().min(9, 'Phone number must be at least 9 digits'),
  email: z.string().email('Invalid email address'),
  licenseNumber: z.string().optional(),
  assemblyPointId: z.number().positive('Please select an assembly point'),
  logoUrl: z.string().url().optional().or(z.literal('')),
});

export type TransportOfficeFormData = z.infer<typeof transportOfficeSchema>;

// ============================================
// BUS SCHEMAS
// ============================================

export const seatLayoutSchema = z.object({
  rows: z.number().int().min(5, 'Minimum 5 rows').max(20, 'Maximum 20 rows'),
  columns: z.number().int().min(2, 'Minimum 2 columns').max(6, 'Maximum 6 columns'),
  layout: z.array(z.array(z.string())).optional(),
});

export const busSchema = z.object({
  plateNumber: z.string().min(1, 'Plate number is required'),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  year: z.number().int().min(2000).max(2030).optional(),
  capacity: z.number().int().min(10, 'Minimum 10 seats').max(100, 'Maximum 100 seats'),
  amenities: z.array(z.enum(BUS_AMENITIES)).default([]),
  seatLayout: seatLayoutSchema.optional(),
  photoUrls: z.array(z.string().url()).default([]),
});

export type BusFormData = z.infer<typeof busSchema>;

// ============================================
// ROUTE SCHEMAS
// ============================================

export const routeSchema = z.object({
  originId: z.number().positive('Please select an origin'),
  destinationId: z.number().positive('Please select a destination'),
  basePrice: z.number().positive('Price must be a positive number'),
  duration: z.number().int().positive('Duration must be a positive number'),
  distance: z.number().positive().optional(),
});

export type RouteFormData = z.infer<typeof routeSchema>;

// ============================================
// TRIP SCHEMAS
// ============================================

export const tripSchema = z.object({
  routeId: z.number().positive('Please select a route'),
  busId: z.number().positive('Please select a bus'),
  departureDate: z.date(),
  departureTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  arrivalTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)')
    .optional(),
  price: z.number().positive().optional(),
});

export type TripFormData = z.infer<typeof tripSchema>;

// ============================================
// BOOKING SCHEMAS
// ============================================

export const bookingSchema = z.object({
  tripId: z.number().positive('Trip is required'),
  seatNumbers: z.array(z.string()).min(1, 'Please select at least one seat'),
  passengerName: z.string().min(2, 'Name must be at least 2 characters'),
  passengerPhone: z.string().min(9, 'Phone number must be at least 9 digits'),
  passengerEmail: z.string().email().optional().or(z.literal('')),
});

export type BookingFormData = z.infer<typeof bookingSchema>;

// ============================================
// PAYMENT SCHEMAS
// ============================================

export const PAYMENT_METHODS = [
  'MobileMoney',
  'CreditCard',
  'DebitCard',
  'CashOnArrival',
  'BankTransfer',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  mobileMoneyNumber: z.string().optional(),
  cardNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  cvv: z.string().optional(),
  bankReference: z.string().optional(),
});

export type PaymentFormData = z.infer<typeof paymentSchema>;

// ============================================
// SEARCH SCHEMAS
// ============================================

export const searchSchema = z.object({
  originId: z.number().positive().optional(),
  destinationId: z.number().positive().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  date: z.date(),
});

export type SearchFormData = z.infer<typeof searchSchema>;

// ============================================
// ASSEMBLY POINT SCHEMA
// ============================================

export const assemblyPointSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  nameAr: z.string().optional(),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  latitude: z.number(),
  longitude: z.number(),
});

export type AssemblyPointFormData = z.infer<typeof assemblyPointSchema>;
