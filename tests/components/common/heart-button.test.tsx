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

import { PropertyCard } from "@/components/site/property/card";
import DetailCard from "@/components/listings/detial-card";

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

    // After click, heart should be filled red
    expect(heartSvg).toHaveClass("fill-red-500");
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

    // After click, heart should revert to white (unfavorited)
    expect(heartSvg).toHaveClass("text-white");
    expect(heartSvg).not.toHaveClass("fill-red-500");
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

// ---------------------------------------------------------------------------
// DetailCard — heart/favorite button tests
// ---------------------------------------------------------------------------

describe("DetailCard heart button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders in unfavorited state by default", () => {
    render(<DetailCard />);
    // Default isFavorited=false, heart should have text-gray-700
    const heartSvg = document.querySelector("svg.lucide-heart");
    expect(heartSvg).toBeInTheDocument();
    expect(heartSvg).toHaveClass("text-gray-700");
    expect(heartSvg).not.toHaveClass("fill-pink-300");
  });

  it("renders in favorited state when isFavorited is true", () => {
    render(<DetailCard isFavorited={true} />);
    const heartSvg = document.querySelector("svg.lucide-heart");
    expect(heartSvg).toBeInTheDocument();
    expect(heartSvg).toHaveClass("fill-pink-300");
    expect(heartSvg).toHaveClass("text-pink-500");
  });

  it("has correct aria-label for unfavorited state", () => {
    render(<DetailCard isFavorited={false} />);
    const button = screen.getByRole("button", { name: "Add to favorites" });
    expect(button).toBeInTheDocument();
  });

  it("has correct aria-label for favorited state", () => {
    render(<DetailCard isFavorited={true} />);
    const button = screen.getByRole("button", {
      name: "Remove from favorites",
    });
    expect(button).toBeInTheDocument();
  });

  it("renders property title and price from props", () => {
    render(
      <DetailCard title="Luxury Villa" price="$500" />
    );
    expect(screen.getByText("Luxury Villa")).toBeInTheDocument();
    expect(screen.getByText("$500")).toBeInTheDocument();
  });
});
