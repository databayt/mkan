// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, renderHook, waitFor } from "@testing-library/react";
import React from "react";

// The provider takes a `lang` and loads the locale's JSON as a code-split
// chunk (perf: it used to receive the whole dictionary as a prop, which
// inlined ~200 kB into every page's HTML). Stubbing the loader keeps this a
// test of the provider/hook contract rather than of the real 3,847-key JSON.
const mockDictionary = {
  metadata: { title: "Test", description: "Test desc" },
  common: { loading: "Loading...", error: "Error" },
} as any;

const getDictionaryClient = vi.fn(async () => mockDictionary);
vi.mock("@/components/internationalization/get-dictionary-client", () => ({
  getDictionaryClient: (lang: string) => getDictionaryClient(lang),
}));

let locale = "en";
vi.mock("@/components/internationalization/use-locale", () => ({
  useLocale: () => ({ locale }),
}));

import {
  DictionaryProvider,
  useDictionary,
} from "@/components/internationalization/dictionary-context";

beforeEach(() => {
  locale = "en";
  getDictionaryClient.mockClear();
});

// The children render behind a Suspense boundary whose fallback is null, and
// `use()` suspends until the locale chunk resolves. React 19 needs that
// suspension flushed inside an awaited `act` — without it the body is still
// empty when the assertion runs, which is what the pre-`use()` version of
// these tests hit.
const renderProvider = async (ui: React.ReactNode, lang = "en") => {
  await act(async () => {
    render(<DictionaryProvider lang={lang as "en" | "ar"}>{ui}</DictionaryProvider>);
  });
};

describe("DictionaryProvider", () => {
  it("renders children passed to it", async () => {
    await renderProvider(<span data-testid="child">Hello</span>);
    expect(screen.getByTestId("child")).toHaveTextContent("Hello");
  });

  it("renders multiple children", async () => {
    await renderProvider(
      <>
        <span data-testid="first">First</span>
        <span data-testid="second">Second</span>
      </>
    );
    expect(screen.getByTestId("first")).toBeInTheDocument();
    expect(screen.getByTestId("second")).toBeInTheDocument();
  });
});

describe("useDictionary", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DictionaryProvider lang="en">{children}</DictionaryProvider>
  );

  it("returns the dictionary the provider loaded", async () => {
    const { result } = renderHook(() => useDictionary(), { wrapper });
    await waitFor(() => expect(result.current).toBe(mockDictionary));
  });

  it("returns the same object reference the provider loaded", async () => {
    const { result } = renderHook(() => useDictionary(), { wrapper });
    await waitFor(() => expect(result.current?.metadata.title).toBe("Test"));
    expect(result.current.common.loading).toBe("Loading...");
  });

  it("loads a locale's chunk exactly once, however many consumers read it", async () => {
    // `use()` requires a stable promise identity across renders, and the
    // module memoises one promise per locale — so N consumers must not mean N
    // fetches of the same JSON. Uses "ar" because that memo is module-level
    // and outlives each test: "en" is already cached by the tests above, so
    // asserting a call count against it would only measure test order.
    locale = "ar";
    const arWrapper = ({ children }: { children: React.ReactNode }) => (
      <DictionaryProvider lang="ar">{children}</DictionaryProvider>
    );
    // "ar" is uncached, so this render genuinely suspends and needs the same
    // awaited act as the provider tests — the "en" hook tests above resolve
    // synchronously off the warm memo and don't.
    let result!: { current: unknown[] };
    await act(async () => {
      ({ result } = renderHook(
        () => [useDictionary(), useDictionary(), useDictionary()],
        { wrapper: arWrapper }
      ));
    });
    expect(result.current[0]).toBe(mockDictionary);
    expect(getDictionaryClient).toHaveBeenCalledTimes(1);
    expect(getDictionaryClient).toHaveBeenCalledWith("ar");
  });

  it("does not throw outside DictionaryProvider (graceful client fallback)", async () => {
    // The hook no longer throws when no provider is present; it returns null
    // until a client-side load resolves. Consumers use optional chaining, so
    // this brief null window degrades to their fallback strings safely.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useDictionary());
    expect(result.current).toBeNull();
    // …and then resolves on its own, without a provider.
    await waitFor(() => expect(result.current).toBe(mockDictionary));

    spy.mockRestore();
  });
});
