// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, renderHook } from "@testing-library/react";
import React from "react";
import {
  DictionaryProvider,
  useDictionary,
} from "@/components/internationalization/dictionary-context";

// Minimal dictionary stub matching the shape of en.json
const mockDictionary = {
  metadata: { title: "Test", description: "Test desc" },
  common: { loading: "Loading...", error: "Error" },
} as any;

describe("DictionaryProvider", () => {
  it("renders children passed to it", () => {
    render(
      <DictionaryProvider dictionary={mockDictionary}>
        <span data-testid="child">Hello</span>
      </DictionaryProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  it("renders multiple children", () => {
    render(
      <DictionaryProvider dictionary={mockDictionary}>
        <span data-testid="first">First</span>
        <span data-testid="second">Second</span>
      </DictionaryProvider>
    );
    expect(screen.getByTestId("first")).toBeInTheDocument();
    expect(screen.getByTestId("second")).toBeInTheDocument();
  });
});

describe("useDictionary", () => {
  it("returns the dictionary value from context", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DictionaryProvider dictionary={mockDictionary}>
        {children}
      </DictionaryProvider>
    );

    const { result } = renderHook(() => useDictionary(), { wrapper });
    expect(result.current).toBe(mockDictionary);
  });

  it("returns the same object reference provided to the provider", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DictionaryProvider dictionary={mockDictionary}>
        {children}
      </DictionaryProvider>
    );

    const { result } = renderHook(() => useDictionary(), { wrapper });
    expect(result.current.metadata.title).toBe("Test");
    expect(result.current.common.loading).toBe("Loading...");
  });

  it("throws when used outside DictionaryProvider", () => {
    // Suppress console.error from React for the expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useDictionary());
    }).toThrow("useDictionary must be used within a DictionaryProvider");

    spy.mockRestore();
  });
});
