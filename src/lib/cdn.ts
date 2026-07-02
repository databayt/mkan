// Copyright (c) 2025-present databayt
//
// Canonical CDN library for cdn.databayt.org — the helper every repo imports.
// Copied from databayt/codebase src/lib/cdn.ts (kept byte-identical across repos;
// `pnpm codebase add cdn` re-syncs it). Two env vars drive it:
//   NEXT_PUBLIC_CDN_DOMAIN    = cdn.databayt.org
//   NEXT_PUBLIC_CDN_NAMESPACE = mkan   (this repo's product namespace)

const HOST = process.env.NEXT_PUBLIC_CDN_DOMAIN?.trim()
  ? `https://${process.env.NEXT_PUBLIC_CDN_DOMAIN.trim()}`
  : "https://cdn.databayt.org";
const NS = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || "";

export const SHARED_NAMESPACES = ["icons", "illustrations", "animations"] as const;
export type SharedNamespace = (typeof SHARED_NAMESPACES)[number];

export const PRODUCT_NAMESPACES = ["hogwarts", "souq", "mkan", "shifa", "kun"] as const;

function join(...segments: string[]): string {
  const path = segments
    .map((s) => s.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `${HOST}/${path}`;
}

export const cdn = {
  /** Vendor mirror — flat: `cdn.vendor("airbnb", "wifi.svg")` */
  vendor: (brand: string, file: string) => join(brand, file),
  /** Shared design primitive: `cdn.shared("icons", "visa.svg")` */
  shared: (ns: SharedNamespace, file: string) => join(ns, file),
  /** This product's own media: `cdn.product("hero.png")` → `/mkan/hero.png` */
  product: (path: string) => join(NS, path),
} as const;

/** Full CDN URL for a manifest/S3 key. */
export function urlForKey(key: string): string {
  return `${HOST}/${key.replace(/^\/+/, "")}`;
}
