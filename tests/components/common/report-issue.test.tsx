// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ReportIssueDialog } from "@/components/report-issue/dialog";

describe("ReportIssueDialog (simplified UI)", () => {
  const defaultProps = {
    hasSession: true,
    onSubmit: vi.fn(),
  };

  it("renders trigger button and opens dialog on click", async () => {
    render(<ReportIssueDialog {...defaultProps} />);

    const trigger = screen.getByRole("button", { name: /report an issue/i });
    expect(trigger).toBeInTheDocument();

    // The dialog content shouldn't be visible before clicking the trigger
    expect(screen.queryByPlaceholderText(/Describe the issue in detail/i)).not.toBeInTheDocument();

    // Click trigger
    fireEvent.click(trigger);

    // The dialog should open and render the textarea
    expect(screen.getByPlaceholderText(/Describe the issue in detail/i)).toBeInTheDocument();
  });

  it("only displays textarea and a submit button (no category dropdown or extra fields)", () => {
    render(<ReportIssueDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /report an issue/i }));

    // Textarea is present
    expect(screen.getByPlaceholderText(/Describe the issue in detail/i)).toBeInTheDocument();

    // Submit button is present
    const submitBtn = screen.getByRole("button", { name: /submit/i });
    expect(submitBtn).toBeInTheDocument();
    // Verify it is the black variant (has the class bg-foreground)
    expect(submitBtn).toHaveClass("bg-foreground");

    // Category dropdown (select element) is NOT present
    expect(screen.queryByLabelText(/category/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    // Collapsible details / steps to reproduce button is NOT present
    expect(screen.queryByText(/add steps and expected behavior/i)).not.toBeInTheDocument();
  });

  it("keeps submit button disabled if input is less than 2 characters", () => {
    render(<ReportIssueDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /report an issue/i }));

    const textarea = screen.getByPlaceholderText(/Describe the issue in detail/i);
    const submitBtn = screen.getByRole("button", { name: /submit/i });

    // Initial disabled state (0 characters)
    expect(submitBtn).toBeDisabled();

    // 1 character - still disabled
    fireEvent.change(textarea, { target: { value: "A" } });
    expect(submitBtn).toBeDisabled();

    // 2 characters - should be enabled
    fireEvent.change(textarea, { target: { value: "ok" } });
    expect(submitBtn).not.toBeDisabled();
  });

  it("submits the form and invokes onSubmit server action", async () => {
    const mockSubmit = vi.fn().mockResolvedValue({ ok: true, issueNumber: 123 });
    render(<ReportIssueDialog {...defaultProps} onSubmit={mockSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /report an issue/i }));

    const textarea = screen.getByPlaceholderText(/Describe the issue in detail/i);
    const submitBtn = screen.getByRole("button", { name: /submit/i });

    fireEvent.change(textarea, {
      target: { value: "ok" },
    });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
      description: "ok",
      category: "other", // defaulted in the background
    }));

    await waitFor(() => {
      expect(screen.getByText(/submitted. tracked as #123/i)).toBeInTheDocument();
    });
  });
});
