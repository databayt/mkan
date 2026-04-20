import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("crypto", () => ({
  randomBytes: vi.fn(() => ({
    toString: () => "abcdef1234567890abcdef1234567890",
  })),
  createHmac: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: () => "mockedsignaturehex",
  })),
}));

import {
  getImageKitConfig,
  validateImageKitConfig,
  IMAGE_UPLOAD_CONFIG,
  generateUploadSignature,
  buildImageUrl,
  validateImageFile,
  getClientUploadParams,
} from "@/lib/imagekit";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = "pub_test";
  process.env.IMAGEKIT_PRIVATE_KEY = "priv_test";
  process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/test";
});

describe("getImageKitConfig", () => {
  it("returns config from env vars", () => {
    const config = getImageKitConfig();
    expect(config).toEqual({
      publicKey: "pub_test",
      privateKey: "priv_test",
      urlEndpoint: "https://ik.imagekit.io/test",
    });
  });

  it("returns empty strings when env vars missing", () => {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
    delete process.env.IMAGEKIT_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

    const config = getImageKitConfig();
    expect(config.publicKey).toBe("");
    expect(config.privateKey).toBe("");
    expect(config.urlEndpoint).toBe("");
  });
});

describe("validateImageKitConfig", () => {
  it("does not warn when config is complete", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateImageKitConfig();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns when config is incomplete", () => {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateImageKitConfig();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("incomplete")
    );
    warnSpy.mockRestore();
  });
});

describe("IMAGE_UPLOAD_CONFIG", () => {
  it("has maxFileSize of 10MB", () => {
    expect(IMAGE_UPLOAD_CONFIG.maxFileSize).toBe(10 * 1024 * 1024);
  });

  it("includes standard image types", () => {
    expect(IMAGE_UPLOAD_CONFIG.allowedTypes).toContain("image/jpeg");
    expect(IMAGE_UPLOAD_CONFIG.allowedTypes).toContain("image/png");
    expect(IMAGE_UPLOAD_CONFIG.allowedTypes).toContain("image/webp");
  });

  it("has transformation presets", () => {
    expect(IMAGE_UPLOAD_CONFIG.transformations).toHaveProperty("thumbnail");
    expect(IMAGE_UPLOAD_CONFIG.transformations).toHaveProperty("card");
    expect(IMAGE_UPLOAD_CONFIG.transformations).toHaveProperty("detail");
    expect(IMAGE_UPLOAD_CONFIG.transformations).toHaveProperty("hero");
  });

  it("has upload folders", () => {
    expect(IMAGE_UPLOAD_CONFIG.folders).toHaveProperty("listings");
    expect(IMAGE_UPLOAD_CONFIG.folders).toHaveProperty("profiles");
    expect(IMAGE_UPLOAD_CONFIG.folders).toHaveProperty("documents");
  });
});

describe("generateUploadSignature", () => {
  it("returns signature, expire, and token", async () => {
    const result = await generateUploadSignature("photo.jpg", "/listings");
    expect(result).toHaveProperty("signature");
    expect(result).toHaveProperty("expire");
    expect(result).toHaveProperty("token");
    expect(typeof result.expire).toBe("number");
    expect(result.signature).toBe("mockedsignaturehex");
  });

  it("sets expiry ~40 minutes in the future", async () => {
    const before = Math.floor(Date.now() / 1000);
    const result = await generateUploadSignature("img.png", "/profiles");
    const after = Math.floor(Date.now() / 1000);
    // expire should be between now+2400-1 and now+2400+1
    expect(result.expire).toBeGreaterThanOrEqual(before + 2399);
    expect(result.expire).toBeLessThanOrEqual(after + 2401);
  });
});

describe("buildImageUrl", () => {
  it("builds URL without transformation", () => {
    const url = buildImageUrl("file123");
    expect(url).toBe("https://ik.imagekit.io/test/file123");
  });

  it("builds URL with transformation", () => {
    const url = buildImageUrl("file123", "thumbnail");
    expect(url).toBe(
      `https://ik.imagekit.io/test/file123?${IMAGE_UPLOAD_CONFIG.transformations.thumbnail}`
    );
  });

  it("returns plain URL for unknown transformation key", () => {
    // Cast to bypass type check for testing
    const url = buildImageUrl("file123", "nonexistent" as never);
    expect(url).toBe("https://ik.imagekit.io/test/file123");
  });
});

describe("validateImageFile", () => {
  it("accepts valid image file", () => {
    const file = new File(["data"], "test.jpg", { type: "image/jpeg" });
    expect(validateImageFile(file)).toEqual({ valid: true });
  });

  it("rejects file exceeding max size", () => {
    const bigBuffer = new ArrayBuffer(11 * 1024 * 1024);
    const file = new File([bigBuffer], "big.jpg", { type: "image/jpeg" });
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("10MB");
  });

  it("rejects disallowed file type", () => {
    const file = new File(["data"], "test.gif", { type: "image/gif" });
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("image/gif");
    expect(result.error).toContain("not allowed");
  });
});

describe("getClientUploadParams", () => {
  it("returns params with default folder", () => {
    const params = getClientUploadParams();
    expect(params.publicKey).toBe("pub_test");
    expect(params.urlEndpoint).toBe("https://ik.imagekit.io/test");
    expect(params.folder).toBe("/listings");
    expect(params.useUniqueFileName).toBe(true);
    expect(params.tags).toEqual(["web-upload"]);
  });

  it("uses custom folder when provided", () => {
    const params = getClientUploadParams("/profiles");
    expect(params.folder).toBe("/profiles");
  });
});
