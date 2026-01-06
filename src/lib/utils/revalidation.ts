import { revalidatePath } from 'next/cache';

/**
 * Revalidation utilities for consistent cache invalidation across the application
 */

/**
 * Revalidate listing-related pages
 * @param hostId - Optional host ID to revalidate host-specific pages
 */
export function revalidateListings(hostId?: string) {
  // Revalidate search and browse pages
  revalidatePath('/[lang]', 'page'); // Home page
  revalidatePath('/[lang]/search', 'page'); // Search page

  // Revalidate host pages if hostId provided
  if (hostId) {
    revalidatePath('/[lang]/host', 'layout'); // All host pages
    revalidatePath('/[lang]/host/overview', 'page');
    revalidatePath('/[lang]/hosting/listings', 'page');
  }

  // Revalidate API routes
  revalidatePath('/api/listings/published', 'page');
}

/**
 * Revalidate transport office and trip pages
 * @param officeId - Optional office ID to revalidate office-specific pages
 */
export function revalidateTransportOffice(officeId?: number) {
  // Revalidate transport search page
  revalidatePath('/[lang]/transport', 'page');

  // Revalidate transport host pages
  revalidatePath('/[lang]/transport-host', 'page');

  if (officeId) {
    revalidatePath(`/[lang]/transport-host/${officeId}`, 'layout'); // All office pages
    revalidatePath(`/[lang]/transport-host/${officeId}/overview`, 'page');
    revalidatePath(`/[lang]/transport-host/${officeId}/trips`, 'page');
  }
}

/**
 * Revalidate transport trip pages
 * @param tripId - Trip ID
 */
export function revalidateTransportTrip(tripId: number) {
  // Revalidate transport search and office pages
  revalidatePath('/[lang]/transport', 'page');
  revalidatePath('/[lang]/transport/search', 'page');

  // Revalidate specific trip page
  revalidatePath(`/[lang]/transport/trip/${tripId}`, 'page');
}

/**
 * Revalidate application-related pages
 * @param propertyId - Optional property ID to revalidate property-specific pages
 * @param tenantId - Optional tenant ID to revalidate tenant-specific pages
 */
export function revalidateApplications(propertyId?: number, tenantId?: string) {
  // Revalidate dashboard pages
  revalidatePath('/[lang]/(dashboard)', 'layout');

  if (propertyId) {
    revalidatePath(`/[lang]/property/${propertyId}`, 'page');
  }

  if (tenantId) {
    revalidatePath('/[lang]/dashboard/applications', 'page');
  }
}

/**
 * Revalidate booking-related pages
 * @param userId - User ID who made the booking
 * @param tripId - Trip ID that was booked
 */
export function revalidateBookings(userId: string, tripId?: number) {
  // Revalidate user bookings page
  revalidatePath('/[lang]/transport/bookings', 'page');
  revalidatePath('/[lang]/dashboard', 'page');

  // Revalidate trip availability if tripId provided
  if (tripId) {
    revalidatePath(`/[lang]/transport/trip/${tripId}`, 'page');
    revalidatePath(`/[lang]/transport/trip/${tripId}/seats`, 'page');
  }
}

/**
 * Revalidate user profile and related pages
 * @param userId - User ID
 */
export function revalidateUserProfile(userId: string) {
  revalidatePath('/[lang]/dashboard', 'layout'); // All dashboard pages
  revalidatePath('/[lang]/profile', 'page');
  revalidatePath('/[lang]/settings', 'page');
}

/**
 * Revalidate all pages (use sparingly, for critical data changes)
 */
export function revalidateAll() {
  revalidatePath('/', 'layout'); // Revalidate entire app
}
