import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

import { revalidatePath } from "next/cache";
import {
  revalidateListings,
  revalidateTransportOffice,
  revalidateTransportTrip,
  revalidateApplications,
  revalidateBookings,
  revalidateUserProfile,
  revalidateAll,
} from "@/lib/utils/revalidation";

const mockRevalidate = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------- revalidateListings ----------
describe("revalidateListings", () => {
  it("revalidates home, search, and API route", () => {
    revalidateListings();

    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]", "page");
    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/search", "page");
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/api/listings/published",
      "page"
    );
  });

  it("revalidates host pages when hostId provided", () => {
    revalidateListings("host-123");

    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/host", "layout");
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/host/overview",
      "page"
    );
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/hosting/listings",
      "page"
    );
  });

  it("does not revalidate host pages without hostId", () => {
    revalidateListings();

    expect(mockRevalidate).not.toHaveBeenCalledWith(
      "/[lang]/host",
      "layout"
    );
  });
});

// ---------- revalidateTransportOffice ----------
describe("revalidateTransportOffice", () => {
  it("revalidates transport and transport-host pages", () => {
    revalidateTransportOffice();

    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/transport", "page");
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport-host",
      "page"
    );
  });

  it("revalidates office-specific pages when officeId provided", () => {
    revalidateTransportOffice(42);

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport-host/42",
      "layout"
    );
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport-host/42/overview",
      "page"
    );
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport-host/42/trips",
      "page"
    );
  });

  it("does not revalidate office pages without officeId", () => {
    revalidateTransportOffice();

    expect(mockRevalidate).not.toHaveBeenCalledWith(
      expect.stringContaining("/transport-host/"),
      "layout"
    );
  });
});

// ---------- revalidateTransportTrip ----------
describe("revalidateTransportTrip", () => {
  it("revalidates transport search and specific trip page", () => {
    revalidateTransportTrip(99);

    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/transport", "page");
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport/search",
      "page"
    );
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport/trip/99",
      "page"
    );
  });
});

// ---------- revalidateApplications ----------
describe("revalidateApplications", () => {
  it("revalidates dashboard layout", () => {
    revalidateApplications();

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/(dashboard)",
      "layout"
    );
  });

  it("revalidates property page when propertyId provided", () => {
    revalidateApplications(7);

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/property/7",
      "page"
    );
  });

  it("revalidates tenant applications page when tenantId provided", () => {
    revalidateApplications(undefined, "tenant-1");

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/dashboard/applications",
      "page"
    );
  });

  it("does not revalidate property or tenant pages without IDs", () => {
    revalidateApplications();

    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });
});

// ---------- revalidateBookings ----------
describe("revalidateBookings", () => {
  it("revalidates bookings and dashboard pages", () => {
    revalidateBookings("user-1");

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport/bookings",
      "page"
    );
    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/dashboard", "page");
  });

  it("revalidates trip availability when tripId provided", () => {
    revalidateBookings("user-1", 55);

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport/trip/55",
      "page"
    );
    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/transport/trip/55/seats",
      "page"
    );
  });

  it("does not revalidate trip pages without tripId", () => {
    revalidateBookings("user-1");

    expect(mockRevalidate).toHaveBeenCalledTimes(2);
  });
});

// ---------- revalidateUserProfile ----------
describe("revalidateUserProfile", () => {
  it("revalidates dashboard, profile, and settings pages", () => {
    revalidateUserProfile("user-1");

    expect(mockRevalidate).toHaveBeenCalledWith(
      "/[lang]/dashboard",
      "layout"
    );
    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/profile", "page");
    expect(mockRevalidate).toHaveBeenCalledWith("/[lang]/settings", "page");
  });
});

// ---------- revalidateAll ----------
describe("revalidateAll", () => {
  it("revalidates entire app from root layout", () => {
    revalidateAll();

    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });
});
