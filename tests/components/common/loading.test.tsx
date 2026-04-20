// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el).toBeInTheDocument();
  });

  it("applies the animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el).toHaveClass("animate-pulse");
  });

  it("merges custom className", () => {
    const { container } = render(<Skeleton className="h-12 w-full" />);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el).toHaveClass("h-12");
    expect(el).toHaveClass("w-full");
    expect(el).toHaveClass("animate-pulse");
  });

  it("passes through additional HTML props", () => {
    render(<Skeleton data-testid="my-skeleton" role="status" />);
    const el = screen.getByTestId("my-skeleton");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("role", "status");
  });
});
