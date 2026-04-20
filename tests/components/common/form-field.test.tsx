// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { FormField } from "@/components/host/form-field";

describe("FormField", () => {
  it("renders the label text", () => {
    render(
      <FormField label="Property Name">
        <input />
      </FormField>
    );
    expect(screen.getByText("Property Name")).toBeInTheDocument();
  });

  it("renders children (input element)", () => {
    render(
      <FormField label="Email">
        <input data-testid="input" type="email" />
      </FormField>
    );
    expect(screen.getByTestId("input")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <FormField label="Title" description="Enter a catchy title">
        <input />
      </FormField>
    );
    expect(screen.getByText("Enter a catchy title")).toBeInTheDocument();
  });

  it("does not render description when not provided", () => {
    const { container } = render(
      <FormField label="Title">
        <input />
      </FormField>
    );
    // Only the label text and the input should be present, no description paragraph
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("renders error message when provided", () => {
    render(
      <FormField label="Price" error="Price is required">
        <input />
      </FormField>
    );
    expect(screen.getByText("Price is required")).toBeInTheDocument();
  });

  it("does not render error message when not provided", () => {
    const { container } = render(
      <FormField label="Price">
        <input />
      </FormField>
    );
    // No error paragraph should exist
    const errorP = container.querySelectorAll("p");
    expect(errorP.length).toBe(0);
  });
});
