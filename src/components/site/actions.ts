"use server";

import { getListings } from "@/components/host/actions";
import { Listing } from "@/types/listing";

export async function getPublishedListings(): Promise<Listing[]> {
  try {
    const listings = await getListings({ publishedOnly: true });
    return listings as Listing[];
  } catch {
    return [];
  }
}