import { describe, it, expect, vi, beforeEach } from "vitest";
import { cn, cleanParams, formatEnumString, formatPriceValue, withToast } from "@/lib/utils";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";
const mockToast = vi.mocked(toast);

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("merges tailwind conflicts correctly", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});

describe("cleanParams", () => {
  it("removes undefined, null, and empty values", () => {
    expect(
      cleanParams({ a: "value", b: undefined, c: null, d: "", e: 0 })
    ).toEqual({ a: "value", e: 0 });
  });

  it("keeps falsy values that are not undefined/null/empty", () => {
    expect(cleanParams({ a: 0, b: false })).toEqual({ a: 0, b: false });
  });

  it("returns empty object for all empty values", () => {
    expect(cleanParams({ a: undefined, b: null, c: "" })).toEqual({});
  });
});

describe("formatEnumString", () => {
  it("adds spaces before capital letters", () => {
    expect(formatEnumString("HighSpeedInternet")).toBe("High Speed Internet");
  });

  it("capitalizes first letter", () => {
    expect(formatEnumString("apartment")).toBe("Apartment");
  });

  it("handles single word", () => {
    expect(formatEnumString("Pool")).toBe("Pool");
  });
});

describe("formatPriceValue", () => {
  it("returns 'Any' text for zero/null", () => {
    expect(formatPriceValue(0, true)).toBe("Any Min Price");
    expect(formatPriceValue(null, false)).toBe("Any Max Price");
    expect(formatPriceValue(undefined, true)).toBe("Any Min Price");
  });

  it("formats thousands with k suffix", () => {
    expect(formatPriceValue(1000, true)).toBe("$1k+");
    expect(formatPriceValue(5000, false)).toBe("<$5k");
  });

  it("formats sub-thousand values", () => {
    expect(formatPriceValue(500, true)).toBe("$500+");
    expect(formatPriceValue(250, false)).toBe("<$250");
  });
});

describe("withToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows success toast and returns result on resolved promise", async () => {
    const result = await withToast(Promise.resolve("data"), {
      success: "Saved!",
    });

    expect(result).toBe("data");
    expect(mockToast.success).toHaveBeenCalledWith("Saved!");
  });

  it("does not show success toast when message is undefined", async () => {
    await withToast(Promise.resolve("data"), {});

    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("shows error toast and rethrows on rejected promise", async () => {
    const error = new Error("fail");
    await expect(
      withToast(Promise.reject(error), { error: "Something went wrong" })
    ).rejects.toThrow("fail");

    expect(mockToast.error).toHaveBeenCalledWith("Something went wrong");
  });

  it("does not show error toast when message is undefined", async () => {
    await expect(
      withToast(Promise.reject(new Error("fail")), {})
    ).rejects.toThrow("fail");

    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("handles both success and error messages", async () => {
    const result = await withToast(Promise.resolve(42), {
      success: "Done!",
      error: "Failed!",
    });

    expect(result).toBe(42);
    expect(mockToast.success).toHaveBeenCalledWith("Done!");
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
