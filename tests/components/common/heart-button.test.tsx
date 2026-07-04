// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Hoisted mock for dictionary used inside vi.mock() factory
const mockUseDictionary = vi.hoisted(() =>
  vi.fn(() => ({
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

// Mock dictionary context
vi.mock("@/components/internationalization/dictionary-context", () => ({
  useDictionary: mockUseDictionary,
}));

// Mock next/image to a plain img
vi.mock("next/image", () => ({
  default: (props: any) => {
    const { fill, priority, sizes, ...rest } = props;
    return <img {...rest} />;
  },
}));

// Mock radix-ui Slot used by Button and Badge
vi.mock("radix-ui", () => ({
  Slot: {
    Slot: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
}));

// Mock the favorites provider so PropertyCard doesn't pull the server-action
// chain (@/lib/actions/favorite-actions → @/auth → next-auth → next/server).
// ready:false makes the card fall back to the isFavorite prop the tests set.
vi.mock("@/components/favorites/favorites-context", () => ({
  useFavorites: () => ({ ready: false, isFavorite: () => false, toggle: vi.fn() }),
}));

import { PropertyCard } from "@/components/site/property/card";
// DetailCard (@/components/listings/detial-card) was retired in the S3/CloudFront
// image migration (483041c); its heart-button tests were removed with it.

// ---------------------------------------------------------------------------
// PropertyCard — heart/favorite button tests
// ---------------------------------------------------------------------------

describe("PropertyCard heart button", () => {
  const baseProps = {
    id: "prop-1",
    images: ["/img/1.jpg"],
    title: "Beach House",
    location: "Miami, FL",
    price: 250,
    rating: 4.85,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders in unfavorited state by default", () => {
    render(<PropertyCard {...baseProps} />);
    // The Heart icon should have text-white class (not fill-red-500) when unfavorited
    const heartSvg = document.querySelector("svg.lucide-heart");
    expect(heartSvg).toBeInTheDocument();
    expect(heartSvg).toHaveClass("text-white");
    expect(heartSvg).not.toHaveClass("fill-red-500");
  });

  it("renders in favorited state when isFavorite is true", () => {
    render(<PropertyCard {...baseProps} isFavorite={true} />);
    const heartSvg = document.querySelector("svg.lucide-heart");
    expect(heartSvg).toBeInTheDocument();
    expect(heartSvg).toHaveClass("fill-red-500");
    expect(heartSvg).toHaveClass("text-red-500");
  });

  it("toggles to favorited on click", () => {
    const onToggle = vi.fn();
    render(
      <PropertyCard
        {...baseProps}
        isFavorite={false}
        onFavoriteToggle={onToggle}
      />
    );

    // Find the heart button container (the button wrapping the Heart icon)
    const heartSvg = document.querySelector("svg.lucide-heart")!;
    const heartButton = heartSvg.closest("button")!;
    fireEvent.click(heartButton);

    // The card delegates the visual state to the shared favorites provider and
    // just fires the callback; it no longer keeps local optimistic heart state.
    expect(onToggle).toHaveBeenCalledWith("prop-1", true);
  });

  it("toggles from favorited to unfavorited on click", () => {
    const onToggle = vi.fn();
    render(
      <PropertyCard
        {...baseProps}
        isFavorite={true}
        onFavoriteToggle={onToggle}
      />
    );

    const heartSvg = document.querySelector("svg.lucide-heart")!;
    const heartButton = heartSvg.closest("button")!;
    fireEvent.click(heartButton);

    // Delegation contract only (see above): visual toggle is the provider's job.
    expect(onToggle).toHaveBeenCalledWith("prop-1", false);
  });

  it("does not propagate click to card when clicking heart", () => {
    const onCardClick = vi.fn();
    render(
      <PropertyCard {...baseProps} onCardClick={onCardClick} />
    );

    const heartSvg = document.querySelector("svg.lucide-heart")!;
    const heartButton = heartSvg.closest("button")!;
    fireEvent.click(heartButton);

    // Card click handler should NOT have been called
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
