"use client";

import { useParams } from "next/navigation";

export default function ListingPage() {
  const params = useParams();
  const id = params?.id;

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Listing {id}</h1>
      <p className="text-gray-600 mt-2">This is a client-side test page.</p>
    </div>
  );
}
