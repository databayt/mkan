// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Hoisted mocks for references inside vi.mock() factories
const mockUseGlobalStore = vi.hoisted(() =>
  vi.fn((selector: (s: any) => any) =>
    selector({ viewMode: "grid", filters: { location: "Los Angeles" } })
  )
);

const mockUseDictionary = vi.hoisted(() =>
  vi.fn(() => ({
    listings: {
      placesIn: "Places in {location}",
      noPropertiesFound: "No properties found",
      adjustFilters: "Try adjusting your search filters to see more results.",
    },
    rental: {
      property: {
        card: {
          superhost: "Superhost",
          in: "in",
          night: "night",
          reviews: "reviews",
          entireHome: "Entire Home",
        },
      },
    },
  }))
);

// Mock zustand store
vi.mock("@/state/filters", () => ({
  useGlobalStore: mockUseGlobalStore,
}));

// Mock dictionary context
vi.mock("@/components/internationalization/dictionary-context", () => ({
  useDictionary: mockUseDictionary,
}));

// Mock next/image to a plain img element
vi.mock("next/image", () => ({
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    const { fill, priority, sizes, ...rest } = props;
    return <img {...rest} />;
  },
}));

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: { user: { id: "user-1" } }, status: "authenticated" })),
  SessionProvider: ({ children }: any) => children,
}));

// Mock next/navigation — Listings now uses useRouter() for card navigation.
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock server actions
vi.mock("@/lib/actions/user-actions", () => ({
  addFavoriteProperty: vi.fn(),
  removeFavoriteProperty: vi.fn(),
}));

import Listings from "@/components/search/listings";

// Helper: build a minimal property array matching what Listings expects
function makeProperties(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Property ${i + 1}`,
    photoUrls: [`/img/${i + 1}.jpg`],
    location: { city: "LA", state: "CA" },
    pricePerMonth: 1000 + i * 100,
    averageRating: 4.5,
  }));
}

describe("Listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to grid view mode
    mockUseGlobalStore.mockImplementation((selector: (s: any) => any) =>
      selector({ viewMode: "grid", filters: { location: "Los Angeles" } })
    );
  });

  // --- Empty state ---

  it("shows empty state when properties array is empty", () => {
    render(<Listings properties={[]} />);
    expect(screen.getByText("No properties found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Try adjusting your search filters to see more results."
      )
    ).toBeInTheDocument();
  });

  it("shows empty state header with 0 count", () => {
    render(<Listings properties={[]} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(
      screen.getByText("Places in Los Angeles")
    ).toBeInTheDocument();
  });

  // --- Rendering listing cards ---

  it("renders listing cards for provided properties in grid mode", () => {
    const properties = makeProperties(3);
    render(<Listings properties={properties} />);

    expect(screen.getByText("Property 1")).toBeInTheDocument();
    expect(screen.getByText("Property 2")).toBeInTheDocument();
    expect(screen.getByText("Property 3")).toBeInTheDocument();
  });

  it("displays property count in header", () => {
    const properties = makeProperties(5);
    render(<Listings properties={properties} />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(
      screen.getByText("Places in Los Angeles")
    ).toBeInTheDocument();
  });

  it("renders price for each property card", () => {
    const properties = makeProperties(2);
    render(<Listings properties={properties} />);

    // Prices are rendered as $<price> inside property cards
    // Property 1: pricePerMonth = 1000, Property 2: pricePerMonth = 1100
    expect(screen.getByText("$1000")).toBeInTheDocument();
    expect(screen.getByText("$1100")).toBeInTheDocument();
  });

  it("renders location from city and state", () => {
    const properties = makeProperties(1);
    render(<Listings properties={properties} />);

    // The PropertyCard renders "in LA, CA" inside a span (dict.in + " " + location)
    // Use a matcher that checks for text containing the location
    expect(screen.getByText((_content, element) => {
      return element?.tagName === "SPAN" && element.textContent?.includes("LA, CA") || false;
    })).toBeInTheDocument();
  });

  // --- List view mode ---

  it("renders list view when viewMode is list", () => {
    mockUseGlobalStore.mockImplementation((selector: (s: any) => any) =>
      selector({ viewMode: "list", filters: { location: "Los Angeles" } })
    );

    const properties = makeProperties(2);
    const { container } = render(<Listings properties={properties} />);

    // List view uses border rounded-lg cards, not the grid layout
    const listCards = container.querySelectorAll(".border.rounded-lg");
    expect(listCards.length).toBe(2);
  });

  it("renders property title and price in list view", () => {
    mockUseGlobalStore.mockImplementation((selector: (s: any) => any) =>
      selector({ viewMode: "list", filters: { location: "Los Angeles" } })
    );

    const properties = makeProperties(1);
    render(<Listings properties={properties} />);

    expect(screen.getByText("Property 1")).toBeInTheDocument();
    expect(screen.getByText("$1000/month")).toBeInTheDocument();
  });

  // --- Handles missing/null properties ---

  it("shows empty state when properties is undefined-like (null cast)", () => {
    // The component checks `!properties || properties.length === 0`
    render(<Listings properties={null as unknown as any[]} />);
    expect(screen.getByText("No properties found")).toBeInTheDocument();
  });

  // --- Filter location in header ---

  it("shows the filter location in the header", () => {
    mockUseGlobalStore.mockImplementation((selector: (s: any) => any) =>
      selector({ viewMode: "grid", filters: { location: "Dubai" } })
    );

    render(<Listings properties={[]} />);
    expect(screen.getByText("Places in Dubai")).toBeInTheDocument();
  });
});
