// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";

// Mock the server actions the provider talks to. The provider imports them from
// `@/components/host/actions` (which re-exports the canonical listing actions).
vi.mock("@/components/host/actions", () => ({
  getListing: vi.fn(),
  updateListing: vi.fn(),
}));

import { getListing, updateListing } from "@/components/host/actions";
import { ListingProvider, useListing } from "@/components/host/use-listing";

const mockGet = vi.mocked(getListing);
const mockUpdate = vi.mocked(updateListing);

// A representative Prisma listing payload (location related row + scalar fields,
// some null to exercise the null → undefined normalisation).
const payload = {
  id: 7,
  title: "Cozy Place",
  description: "Nice and quiet",
  pricePerNight: 100,
  securityDeposit: null,
  applicationFee: null,
  bedrooms: 2,
  bathrooms: 1,
  squareFeet: null,
  guestCount: 3,
  propertyType: "Apartment",
  isPetsAllowed: false,
  isParkingIncluded: true,
  instantBook: false,
  amenities: ["WiFi"],
  highlights: [],
  photoUrls: ["a.jpg"],
  draft: true,
  isPublished: false,
  location: {
    address: "1 Diving St",
    city: "Port Sudan",
    state: "Red Sea",
    country: "Sudan",
    postalCode: "00000",
    latitude: 19.6,
    longitude: 37.2,
  },
  host: { id: "host-1", email: "h@x.sd", username: "host", image: null },
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ListingProvider>{children}</ListingProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  // The provider logs update failures via console.error — silence the noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("useListing — guard", () => {
  it("throws when used outside a ListingProvider", () => {
    expect(() => renderHook(() => useListing())).toThrow(
      /within a ListingProvider/
    );
  });
});

describe("loadListing — Prisma → client mapping", () => {
  it("flattens the location relation and normalises null → undefined", async () => {
    mockGet.mockResolvedValue(payload as never);
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });

    expect(result.current.listing).toMatchObject({
      id: 7,
      title: "Cozy Place",
      isParkingIncluded: true,
      // location is flattened onto the listing
      city: "Port Sudan",
      country: "Sudan",
      latitude: 19.6,
      longitude: 37.2,
    });
    // null DB columns become undefined, not null
    expect(result.current.listing?.securityDeposit).toBeUndefined();
    expect(result.current.listing?.squareFeet).toBeUndefined();
    expect(result.current.error).toBeNull();
  });
});

describe("loadListing — dedupe guard", () => {
  it("fetches a given id only once across repeat calls", async () => {
    mockGet.mockResolvedValue(payload as never);
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });
    await act(async () => {
      await result.current.loadListing(7);
    });
    await act(async () => {
      await result.current.loadListing(7);
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight calls for the same id", async () => {
    mockGet.mockResolvedValue(payload as never);
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      // Fire both before awaiting — the second must see the in-flight guard.
      await Promise.all([
        result.current.loadListing(7),
        result.current.loadListing(7),
      ]);
    });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("fetches again when the id changes", async () => {
    mockGet.mockResolvedValueOnce(payload as never);
    mockGet.mockResolvedValueOnce({ ...payload, id: 8 } as never);
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });
    await act(async () => {
      await result.current.loadListing(8);
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.listing?.id).toBe(8);
  });

  it("retries after a failed load (does not poison the id)", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });
    expect(result.current.error).toBe("boom");
    expect(result.current.listing).toBeNull();

    mockGet.mockResolvedValue(payload as never);
    await act(async () => {
      await result.current.loadListing(7);
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.listing?.id).toBe(7);
  });
});

describe("updateListingData", () => {
  it("is a no-op (no server call) when there is no listing id yet", async () => {
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.updateListingData({ title: "x" });
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("calls updateListing with the current id and merges the result", async () => {
    mockGet.mockResolvedValue(payload as never);
    mockUpdate.mockResolvedValue({
      success: true,
      listing: { ...payload, title: "Renamed" },
    } as never);
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });
    await act(async () => {
      await result.current.updateListingData({ title: "Renamed" });
    });

    expect(mockUpdate).toHaveBeenCalledWith(7, { title: "Renamed" });
    expect(result.current.listing?.title).toBe("Renamed");
    expect(result.current.error).toBeNull();
  });

  it("surfaces an ownership error from the server without throwing", async () => {
    mockGet.mockResolvedValue(payload as never);
    mockUpdate.mockRejectedValue(
      new Error("You can only update your own listings")
    );
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });
    await act(async () => {
      await result.current.updateListingData({ title: "x" });
    });

    expect(result.current.error).toMatch(/your own/);
    // The previously loaded listing is preserved on a failed update.
    expect(result.current.listing?.id).toBe(7);
  });
});

describe("clearError", () => {
  it("resets the error back to null", async () => {
    mockGet.mockRejectedValueOnce(new Error("nope"));
    const { result } = renderHook(() => useListing(), { wrapper });

    await act(async () => {
      await result.current.loadListing(7);
    });
    expect(result.current.error).toBe("nope");

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
