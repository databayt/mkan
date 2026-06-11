import { Resend } from "resend";

// Lazy + null-safe: `new Resend(undefined)` throws at module load, which
// took down every route that transitively imports this file (the Stripe
// webhook failed `next build` page-data collection). Without a key we log
// and skip the send instead — email is best-effort, never load-bearing.
let _resend: Resend | null | undefined;
function getResend(): Resend | null {
  if (_resend !== undefined) return _resend;
  const key = process.env.RESEND_API_KEY;
  _resend = key ? new Resend(key) : null;
  return _resend;
}

const resend = {
  emails: {
    async send(payload: Parameters<Resend["emails"]["send"]>[0]) {
      const client = getResend();
      if (!client) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "email_skipped_no_api_key",
            to: "[redacted]",
            subject: (payload as { subject?: string }).subject,
          }),
        );
        return { data: null, error: null };
      }
      return client.emails.send(payload);
    },
  },
};

const domain = process.env.NEXT_PUBLIC_APP_URL;

// Single sender for every transactional email. The Resend sandbox address
// (`onboarding@resend.dev`) only delivers to the account owner, so auth mail
// (verify/reset/2FA) silently failed for real users until this was unified.
// Production MUST set EMAIL_FROM to a verified domain (SPF/DKIM/DMARC).
const EMAIL_FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

export const sendTwoFactorTokenEmail = async (
  email: string,
  token: string
) => {
  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: "2FA Code",
    html: `<p>Your 2FA code: ${token}</p>`
  });
};

export const sendPasswordResetEmail = async (
  email: string,
  token: string,
) => {
  const resetLink = `${domain}/new-password?token=${token}`

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: "Reset your password",
    html: `<p>Click <a href="${resetLink}">here</a> to reset password.</p>`
  });
};

export const sendVerificationEmail = async (
  email: string,
  token: string
) => {
  const confirmLink = `${domain}/new-verification?token=${token}`;

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: "Confirm your email",
    html: `<p>Click <a href="${confirmLink}">here</a> to confirm email.</p>`
  });
};

export const sendTripCancelledEmail = async (
  email: string,
  data: {
    bookingReference: string;
    origin: string;
    destination: string;
    departureDate: string;
    operatorName: string;
  },
) => {
  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `Your trip ${data.origin} → ${data.destination} has been cancelled`,
    html: `
      <p>Hello,</p>
      <p>${data.operatorName} has cancelled your trip on ${data.departureDate}.</p>
      <p><strong>Booking reference:</strong> ${data.bookingReference}</p>
      <p>Your booking has been marked cancelled. If you paid online, the refund is being processed.</p>
      <p>You can rebook on mkan at <a href="${domain}/transport">mkan transport</a>.</p>
    `,
  });
};

/**
 * Home (property) booking confirmation. Distinct from the transport-shaped
 * sendBookingConfirmationEmail above (origin→destination/seats); this one
 * carries property/stay fields. Sent from EMAIL_FROM once a Booking is
 * Confirmed (Stripe webhook, admin reference-verification, or host confirm).
 */
export const sendHomeBookingConfirmationEmail = async (
  email: string,
  data: {
    reference: string;
    guestName: string;
    propertyTitle: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    guests: number;
    total: number;
    currency: string;
  },
) => {
  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `Booking confirmed — ${data.propertyTitle}`,
    html: `
      <p>Hi ${data.guestName}, your booking is confirmed.</p>
      <p><strong>Reference:</strong> ${data.reference}<br/>
         <strong>Property:</strong> ${data.propertyTitle}<br/>
         <strong>Check-in:</strong> ${data.checkIn}<br/>
         <strong>Check-out:</strong> ${data.checkOut}<br/>
         <strong>Nights:</strong> ${data.nights} &middot; <strong>Guests:</strong> ${data.guests}<br/>
         <strong>Total:</strong> ${data.total.toLocaleString()} ${data.currency}</p>
      <p>View your booking at <a href="${domain}/bookings">mkan bookings</a>.</p>
    `,
  });
};

export const sendBookingConfirmationEmail = async (
  email: string,
  data: {
    bookingReference: string;
    origin: string;
    destination: string;
    departureDate: string;
    departureTime: string;
    seats: string[];
    totalAmount: number;
    ticketUrl: string;
  },
) => {
  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `Booking confirmed — ${data.origin} → ${data.destination}`,
    html: `
      <p>Your booking is confirmed.</p>
      <p><strong>Reference:</strong> ${data.bookingReference}<br/>
         <strong>Route:</strong> ${data.origin} → ${data.destination}<br/>
         <strong>Departure:</strong> ${data.departureDate} ${data.departureTime}<br/>
         <strong>Seats:</strong> ${data.seats.join(", ")}<br/>
         <strong>Total:</strong> ${data.totalAmount.toLocaleString()} SDG</p>
      <p>Your ticket: <a href="${data.ticketUrl}">${data.ticketUrl}</a></p>
    `,
  });
};
