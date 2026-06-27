"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type SearchMap from "./search-map";

// mapbox-gl touches `window` at import time, so it must never run during SSR.
// The search page is a Server Component and cannot use `ssr: false` directly,
// so this client wrapper owns the dynamic import.
const SearchMapClient = dynamic(() => import("./search-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full border-s border-gray-200">
      <div
        className="sticky bg-background p-2"
        style={{ top: 64, height: "calc(100vh - 64px)" }}
      >
        <div className="h-full w-full bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    </div>
  ),
});

export default function SearchMapLoader(props: ComponentProps<typeof SearchMap>) {
  return <SearchMapClient {...props} />;
}
