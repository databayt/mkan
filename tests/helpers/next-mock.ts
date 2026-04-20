import { vi } from "vitest";

/**
 * Redirect error - matches Next.js behavior where redirect() throws
 */
export const REDIRECT_ERROR = "NEXT_REDIRECT";

export function createRedirectError(url: string): Error {
  const error = new Error(REDIRECT_ERROR);
  (error as Error & { url: string }).url = url;
  return error;
}

/**
 * Mock for next/navigation
 */
export function createNavigationMock() {
  return {
    redirect: vi.fn((url: string) => {
      throw createRedirectError(url);
    }),
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    })),
    usePathname: vi.fn(() => "/"),
    useSearchParams: vi.fn(() => new URLSearchParams()),
    useParams: vi.fn(() => ({ lang: "en" })),
  };
}

/**
 * Mock for next/cache
 */
export function createCacheMock() {
  return {
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
    unstable_cache: vi.fn(
      (fn: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) =>
          fn(...args)
    ),
  };
}

/**
 * Mock for next/headers
 */
export function createHeadersMock(headerMap: Record<string, string> = {}) {
  return {
    headers: vi.fn(() => ({
      get: vi.fn((key: string) => headerMap[key] ?? null),
      has: vi.fn((key: string) => key in headerMap),
      entries: vi.fn(() => Object.entries(headerMap)[Symbol.iterator]()),
    })),
    cookies: vi.fn(() => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    })),
  };
}

/**
 * Helper to assert a redirect was thrown
 */
export function expectRedirect(fn: () => Promise<unknown>, expectedUrl: string) {
  return expect(fn()).rejects.toThrow(REDIRECT_ERROR);
}
