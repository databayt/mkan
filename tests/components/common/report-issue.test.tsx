// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Mock next/navigation before importing the component
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/some-page",
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

// Mock the server action
vi.mock("@/lib/actions/report-issue", () => ({
  reportIssue: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock radix-ui dialog to render content directly for testability
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (
    <div data-testid="dialog" data-open={open}>
      {children}
    </div>
  ),
  DialogContent: ({ children }: any) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: any) => <div>{children}</div>,
}));

import { ReportIssue } from "@/components/report-issue";

describe("ReportIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the trigger link text in English", () => {
    render(<ReportIssue />);
    // Text appears in both the trigger button and the dialog title
    const elements = screen.getAllByText("Report an issue");
    expect(elements.length).toBeGreaterThanOrEqual(1);
    // The first match is the trigger button
    expect(elements[0]).toBeInTheDocument();
  });

  it("renders the dialog title", () => {
    render(<ReportIssue />);
    // The dialog content is always rendered (mocked without portal)
    expect(screen.getByRole("heading", { name: "Report an issue" })).toBeInTheDocument();
  });

  it("renders a textarea with placeholder", () => {
    render(<ReportIssue />);
    const textarea = screen.getByPlaceholderText("Describe the issue...");
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("renders the submit button", () => {
    render(<ReportIssue />);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeInTheDocument();
  });

  it("disables submit button when description is empty", () => {
    render(<ReportIssue />);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toBeDisabled();
  });

  it("enables submit button when description has text", () => {
    render(<ReportIssue />);
    const textarea = screen.getByPlaceholderText("Describe the issue...");
    fireEvent.change(textarea, { target: { value: "Something is broken" } });
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).not.toBeDisabled();
  });
});
