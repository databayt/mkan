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
  sanitizeFilename,
  sanitizeBoolean,
  sanitizeJson,
  sanitizeObject,
  sanitizeSqlIdentifier,
  sanitizeCreditCard,
  maskSensitiveData,
  generateCSPNonce,
} from "@/lib/sanitization";
import sanitize from "@/lib/sanitization";

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

describe("sanitizeFilename", () => {
  it("removes path separators", () => {
    // sanitizeFilename replaces / \ : \0 with _ but not dots
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
    expect(result).toContain("etc_passwd");
  });

  it("removes special characters", () => {
    expect(sanitizeFilename('file<>:"|?*.txt')).toBe("file_______.txt");
  });

  it("removes leading/trailing dots and spaces", () => {
    expect(sanitizeFilename("...hidden")).toBe("hidden");
    expect(sanitizeFilename("  file.txt  ")).toBe("file.txt");
  });

  it("limits length to 255 characters", () => {
    const longName = "a".repeat(300) + ".txt";
    const result = sanitizeFilename(longName);
    expect(result.length).toBeLessThanOrEqual(255);
    expect(result.endsWith(".txt")).toBe(true);
  });

  it("returns 'unnamed' for empty result", () => {
    expect(sanitizeFilename("...")).toBe("unnamed");
    expect(sanitizeFilename("")).toBe("unnamed");
  });
});

describe("sanitizeBoolean", () => {
  it("returns true for truthy values", () => {
    expect(sanitizeBoolean(true)).toBe(true);
    expect(sanitizeBoolean("true")).toBe(true);
    expect(sanitizeBoolean(1)).toBe(true);
    expect(sanitizeBoolean("1")).toBe(true);
  });

  it("returns false for falsy values", () => {
    expect(sanitizeBoolean(false)).toBe(false);
    expect(sanitizeBoolean("false")).toBe(false);
    expect(sanitizeBoolean(0)).toBe(false);
    expect(sanitizeBoolean("0")).toBe(false);
    expect(sanitizeBoolean(null)).toBe(false);
    expect(sanitizeBoolean(undefined)).toBe(false);
    expect(sanitizeBoolean("anything")).toBe(false);
  });
});

describe("sanitizeJson", () => {
  it("parses valid JSON and sanitizes string values", () => {
    const result = sanitizeJson('{"name": "  hello\\u0000  "}');
    expect(result).toEqual({ name: "hello" });
  });

  it("returns null for invalid JSON", () => {
    expect(sanitizeJson("not json")).toBeNull();
    expect(sanitizeJson("{broken")).toBeNull();
  });

  it("handles nested objects", () => {
    const result = sanitizeJson('{"a": {"b": "  test  "}}');
    expect(result).toEqual({ a: { b: "test" } });
  });

  it("handles arrays", () => {
    const result = sanitizeJson('["  hello  ", "  world  "]');
    expect(result).toEqual(["hello", "world"]);
  });
});

describe("sanitizeObject", () => {
  it("returns null/undefined as-is", () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(undefined)).toBeUndefined();
  });

  it("sanitizes string values", () => {
    expect(sanitizeObject("  hello\x00  ")).toBe("hello");
  });

  it("recursively sanitizes nested objects", () => {
    const result = sanitizeObject({ a: { b: "  test\x00  " } });
    expect(result).toEqual({ a: { b: "test" } });
  });

  it("sanitizes arrays", () => {
    const result = sanitizeObject(["  a  ", "  b  "]);
    expect(result).toEqual(["a", "b"]);
  });

  it("preserves numbers and booleans", () => {
    const result = sanitizeObject({ num: 42, bool: true });
    expect(result).toEqual({ num: 42, bool: true });
  });

  it("sanitizes object keys", () => {
    const result = sanitizeObject({ "  key\x00  ": "value" });
    expect(result).toHaveProperty("key");
  });
});

describe("sanitizeSqlIdentifier", () => {
  it("keeps alphanumeric and underscores", () => {
    expect(sanitizeSqlIdentifier("valid_name_123")).toBe("valid_name_123");
  });

  it("removes SQL injection characters", () => {
    expect(sanitizeSqlIdentifier("table; DROP--")).toBe("tableDROP");
  });

  it("handles empty input", () => {
    expect(sanitizeSqlIdentifier("")).toBe("");
  });
});

describe("sanitizeCreditCard", () => {
  it("extracts digits from formatted card number", () => {
    expect(sanitizeCreditCard("4111-1111-1111-1111")).toBe("4111111111111111");
    expect(sanitizeCreditCard("4111 1111 1111 1111")).toBe("4111111111111111");
  });

  it("returns empty for too short", () => {
    expect(sanitizeCreditCard("1234")).toBe("");
  });

  it("returns empty for too long", () => {
    expect(sanitizeCreditCard("12345678901234567890")).toBe("");
  });

  it("accepts valid length range (13-19 digits)", () => {
    expect(sanitizeCreditCard("1234567890123")).toBe("1234567890123");
    expect(sanitizeCreditCard("1234567890123456789")).toBe("1234567890123456789");
  });
});

describe("maskSensitiveData", () => {
  it("masks data with last N chars visible", () => {
    expect(maskSensitiveData("1234567890", 4)).toBe("******7890");
  });

  it("masks everything if data shorter than visibleChars", () => {
    expect(maskSensitiveData("ab", 4)).toBe("**");
  });

  it("uses default of 4 visible chars", () => {
    expect(maskSensitiveData("1234567890")).toBe("******7890");
  });

  it("handles empty string", () => {
    expect(maskSensitiveData("")).toBe("");
  });
});

describe("generateCSPNonce", () => {
  it("returns a base64 string", () => {
    const nonce = generateCSPNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("generates unique values", () => {
    const a = generateCSPNonce();
    const b = generateCSPNonce();
    expect(a).not.toBe(b);
  });

  it("has expected length (16 bytes = ~24 base64 chars)", () => {
    const nonce = generateCSPNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(20);
    expect(nonce.length).toBeLessThanOrEqual(28);
  });
});

describe("sanitize (default export)", () => {
  it("defaults to text sanitization", () => {
    expect(sanitize("  hello\x00  ")).toBe("hello");
  });

  it("handles html type", () => {
    expect(sanitize('<script>alert(1)</script>', "html")).not.toContain("<script>");
  });

  it("handles email type", () => {
    expect(sanitize("User@Example.COM", "email")).toBe("user@example.com");
  });

  it("handles url type", () => {
    expect(sanitize("javascript:alert(1)", "url")).toBe("");
  });

  it("handles filename type", () => {
    const result = sanitize("../../etc/passwd", "filename") as string;
    expect(result).not.toContain("/");
    expect(result).toContain("etc_passwd");
  });

  it("handles json type", () => {
    expect(sanitize('{"key": "value"}', "json")).toEqual({ key: "value" });
  });

  it("handles search type", () => {
    expect(sanitize("hello; DROP TABLE", "search")).toBe("hello DROP TABLE");
  });

  it("returns empty string for null/undefined", () => {
    expect(sanitize(null)).toBe("");
    expect(sanitize(undefined)).toBe("");
  });

  it("converts non-string inputs to string", () => {
    expect(sanitize(42)).toBe("42");
  });
});

describe("sanitizeUrl (hardened)", () => {
  it("blocks javascript with whitespace obfuscation", () => {
    expect(sanitizeUrl("java\tscript:alert(1)")).toBe("");
    expect(sanitizeUrl("java\nscript:alert(1)")).toBe("");
  });

  it("blocks vbscript protocol", () => {
    expect(sanitizeUrl("vbscript:msgbox")).toBe("");
  });

  it("blocks data protocol in malformed URL", () => {
    expect(sanitizeUrl("data:text/html,<h1>hi</h1>")).toBe("");
  });
});
