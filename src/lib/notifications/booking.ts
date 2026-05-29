import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendHomeBookingConfirmationEmail } from "@/lib/mail";

/**
 * Best-effort: email the guest that their home booking is confirmed. NEVER
 * throws — a mail failure must not roll back a payment/confirmation that has
 * already committed. Call this AFTER the Booking row is set to Confirmed
 * (Stripe webhook, admin reference-verification, or manual host confirm).
 *
 * NB: delivery additionally requires a verified Resend domain + RESEND_API_KEY
 * in the environment; the wiring is correct without it but mail won't send.
 */
export async function notifyHomeBookingConfirmed(bookingId: number): Promise<void> {
  try {
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        checkIn: true,
        checkOut: true,
        nightsCount: true,
        guestCount: true,
        totalPrice: true,
        guest: { select: { email: true, username: true } },
        listing: { select: { title: true } },
      },
    });

    if (!booking?.guest?.email) {
      logger.warn("home_booking_confirm_email_skipped", { bookingId });
      return;
    }

    await sendHomeBookingConfirmationEmail(booking.guest.email, {
      reference: `MKAN-${booking.id}`,
      guestName: booking.guest.username ?? "Guest",
      propertyTitle: booking.listing?.title ?? "Your stay",
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      nights: booking.nightsCount,
      guests: booking.guestCount,
      total: booking.totalPrice,
      currency: "SDG",
    });

    logger.info("home_booking_confirm_email_sent", { bookingId });
  } catch (err) {
    logger.error("home_booking_confirm_email_failed", {
      bookingId,
      error: String(err),
    });
  }
}
