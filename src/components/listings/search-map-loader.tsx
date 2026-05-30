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
    <div className="w-[430px] border-s border-gray-200">
      <div className="sticky top-16 h-[calc(100vh-64px)] bg-gray-100 animate-pulse" />
    </div>
  ),
});

export default function SearchMapLoader(props: ComponentProps<typeof SearchMap>) {
  return <SearchMapClient {...props} />;
}
