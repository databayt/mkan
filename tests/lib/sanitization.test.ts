import { describe, it, expect } from "vitest";
import {
  sanitizeInput,
  sanitizeHtml,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  sanitizeSearchQuery,
  sanitizeText,
  sanitizeNumber,
  stripHtml,
} from "@/lib/sanitization";

describe("sanitizeInput", () => {
  it("trims whitespace", () => {
    expect(sanitizeInput("  hello  ")).toBe("hello");
  });

  it("removes null bytes", () => {
    expect(sanitizeInput("hello\x00world")).toBe("helloworld");
  });

  it("removes control characters but keeps newlines and tabs", () => {
    expect(sanitizeInput("hello\x01\x02world")).toBe("helloworld");
    expect(sanitizeInput("hello\nworld")).toBe("hello\nworld");
    expect(sanitizeInput("hello\tworld")).toBe("hello\tworld");
  });

  it("normalizes unicode", () => {
    // e + combining accent vs precomposed
    const combined = "e\u0301"; // é as two characters
    const result = sanitizeInput(combined);
    expect(result).toBe("\u00e9"); // precomposed é
  });

  it("handles empty string", () => {
    expect(sanitizeInput("")).toBe("");
  });
});

describe("sanitizeHtml", () => {
  it("strips XSS script tags", () => {
    const result = sanitizeHtml('<script>alert("xss")</script>Hello');
    expect(result).not.toContain("<script>");
    expect(result).toContain("Hello");
  });

  it("strips event handlers", () => {
    const result = sanitizeHtml('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain("onerror");
  });

  it("allows safe tags", () => {
    const result = sanitizeHtml("<b>bold</b> <i>italic</i>");
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("<i>italic</i>");
  });

  it("allows safe links with href", () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain("https://example.com");
  });

  it("strips javascript: protocol in links", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">bad</a>');
    expect(result).not.toContain("javascript:");
  });

  it("strips data: URIs", () => {
    const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">bad</a>');
    expect(result).not.toContain("data:");
  });
});

describe("sanitizeEmail", () => {
  it("validates correct email", () => {
    expect(sanitizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("lowercases email", () => {
    expect(sanitizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("returns empty for invalid email", () => {
    expect(sanitizeEmail("not-an-email")).toBe("");
    expect(sanitizeEmail("@example.com")).toBe("");
    expect(sanitizeEmail("user@")).toBe("");
  });

  it("rejects XSS in email", () => {
    expect(sanitizeEmail('<script>alert(1)</script>@example.com')).toBe("");
  });
});

describe("sanitizePhone", () => {
  it("keeps digits and plus sign", () => {
    expect(sanitizePhone("+1 (234) 567-8900")).toBe("+12345678900");
  });

  it("removes non-numeric characters", () => {
    expect(sanitizePhone("abc123def")).toBe("123");
  });

  it("truncates to 20 characters", () => {
    const longNumber = "+123456789012345678901234567890";
    expect(sanitizePhone(longNumber).length).toBeLessThanOrEqual(20);
  });
});

describe("sanitizeUrl", () => {
  it("allows https URLs", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com/");
  });

  it("allows http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("blocks javascript: protocol", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
  });

  it("blocks data: protocol", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
  });

  it("handles relative paths", () => {
    const result = sanitizeUrl("/path/to/resource");
    expect(result).toBe("/path/to/resource");
  });
});

describe("sanitizeSearchQuery", () => {
  it("removes special characters", () => {
    const result = sanitizeSearchQuery("hello; DROP TABLE--");
    expect(result).not.toContain(";");
    // sanitizeSearchQuery replaces non-word chars except hyphens with spaces
    // Double hyphens are kept since hyphens are allowed
    expect(result).toBe("hello DROP TABLE--");
  });

  it("limits length to 100 characters", () => {
    const longQuery = "a".repeat(200);
    expect(sanitizeSearchQuery(longQuery).length).toBeLessThanOrEqual(100);
  });

  it("normalizes whitespace", () => {
    expect(sanitizeSearchQuery("hello   world")).toBe("hello world");
  });
});

describe("sanitizeText", () => {
  it("escapes HTML entities", () => {
    expect(sanitizeText("<script>")).toBe("&lt;script&gt;");
    expect(sanitizeText('"quotes"')).toBe("&quot;quotes&quot;");
    expect(sanitizeText("'single'")).toBe("&#x27;single&#x27;");
  });
});

describe("sanitizeNumber", () => {
  it("parses valid numbers", () => {
    expect(sanitizeNumber("42")).toBe(42);
    expect(sanitizeNumber(3.14)).toBe(3.14);
  });

  it("returns 0 for invalid numbers", () => {
    expect(sanitizeNumber("not-a-number")).toBe(0);
    expect(sanitizeNumber(NaN)).toBe(0);
    expect(sanitizeNumber(Infinity)).toBe(0);
  });
});

describe("stripHtml", () => {
  it("removes all HTML tags", () => {
    expect(stripHtml("<b>bold</b> <i>italic</i>")).toBe("bold italic");
  });

  it("removes script tags and content", () => {
    const result = stripHtml('<script>alert(1)</script>Hello');
    expect(result).not.toContain("alert");
    expect(result).toContain("Hello");
  });
});
