import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    booking: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/mail", () => ({
  sendHomeBookingConfirmationEmail: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { db } from "@/lib/db";
import { sendHomeBookingConfirmationEmail } from "@/lib/mail";
import { notifyHomeBookingConfirmed } from "@/lib/notifications/booking";

const mockFindUnique = vi.mocked(db.booking.findUnique);
const mockSend = vi.mocked(sendHomeBookingConfirmationEmail);

describe("notifyHomeBookingConfirmed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emails the guest with formatted booking data", async () => {
    mockFindUnique.mockResolvedValue({
      id: 42,
      checkIn: new Date("2026-06-01T14:00:00Z"),
      checkOut: new Date("2026-06-05T11:00:00Z"),
      nightsCount: 4,
      guestCount: 2,
      totalPrice: 1200,
      guest: { email: "guest@example.com", username: "amna" },
      listing: { title: "Nile View Apartment" },
    } as never);

    await notifyHomeBookingConfirmed(42);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      "guest@example.com",
      expect.objectContaining({
        reference: "MKAN-42",
        guestName: "amna",
        propertyTitle: "Nile View Apartment",
        checkIn: "2026-06-01",
        checkOut: "2026-06-05",
        nights: 4,
        guests: 2,
        total: 1200,
        currency: "SDG",
      })
    );
  });

  it("skips sending when the booking has no guest email", async () => {
    mockFindUnique.mockResolvedValue({ id: 1, guest: null } as never);
    await notifyHomeBookingConfirmed(1);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("falls back to defaults for missing username / listing title", async () => {
    mockFindUnique.mockResolvedValue({
      id: 9,
      checkIn: new Date("2026-07-10"),
      checkOut: new Date("2026-07-12"),
      nightsCount: 2,
      guestCount: 1,
      totalPrice: 500,
      guest: { email: "x@y.com", username: null },
      listing: { title: null },
    } as never);

    await notifyHomeBookingConfirmed(9);

    expect(mockSend).toHaveBeenCalledWith(
      "x@y.com",
      expect.objectContaining({ guestName: "Guest", propertyTitle: "Your stay" })
    );
  });

  it("never throws when the mail send fails", async () => {
    mockFindUnique.mockResolvedValue({
      id: 7,
      checkIn: new Date("2026-06-01"),
      checkOut: new Date("2026-06-03"),
      nightsCount: 2,
      guestCount: 1,
      totalPrice: 500,
      guest: { email: "x@y.com", username: null },
      listing: { title: null },
    } as never);
    mockSend.mockRejectedValueOnce(new Error("resend down"));

    await expect(notifyHomeBookingConfirmed(7)).resolves.toBeUndefined();
  });
});
