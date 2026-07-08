"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type TravelSearchMap from "./travel-search-map";

const TravelSearchMapClient = dynamic(() => import("./travel-search-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full">
      <div
        className="sticky w-full bg-background"
        style={{ top: 128, height: "calc(100vh - 128px)" }}
      >
        <div className="h-full w-full bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    </div>
  ),
});

export default function TravelSearchMapLoader(props: ComponentProps<typeof TravelSearchMap>) {
  return <TravelSearchMapClient {...props} />;
}
