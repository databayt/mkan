import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const domain = process.env.NEXT_PUBLIC_APP_URL;

export const sendTwoFactorTokenEmail = async (
  email: string,
  token: string
) => {
  await resend.emails.send({
    from: "onboarding@resend.dev",
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
    from: "onboarding@resend.dev",
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
    from: "onboarding@resend.dev",
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
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
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
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
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
