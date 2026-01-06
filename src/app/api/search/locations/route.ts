import { NextRequest, NextResponse } from "next/server";
import {
  getLocationSuggestions,
  getPopularLocations,
} from "@/lib/actions/search-actions";
import { SEARCH_CONFIG } from "@/lib/schemas/search-schema";

export const revalidate = 3600; // Cache for 1 hour

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const limitParam = searchParams.get("limit");
    const limit = limitParam
      ? Math.min(parseInt(limitParam), 20)
      : SEARCH_CONFIG.MAX_LOCATION_RESULTS;

    let locations;

    if (query.trim()) {
      locations = await getLocationSuggestions(query, limit);
    } else {
      locations = await getPopularLocations(limit);
    }

    return NextResponse.json(
      {
        success: true,
        data: locations,
        count: locations.length,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
  } catch (error) {
    console.error("Location API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch locations",
        data: [],
      },
      { status: 500 }
    );
  }
}
