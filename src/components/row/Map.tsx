"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

interface MapProps {
  center?: number[];
  locationValue?: string;
}

const Map: React.FC<MapProps> = ({ center }) => {
  const MapComponent = useMemo(
    () =>
      dynamic(() => import("./MapComponent"), {
        loading: () => <Skeleton className="h-[35vh] w-full rounded-lg" />,
        ssr: false,
      }),
    []
  );

  return <MapComponent center={center} />;
};

export default Map;
