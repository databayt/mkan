import { getListing } from "@/components/host/actions";
import { notFound } from "next/navigation";

interface ListingPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

export default async function ListingPage({ params }: ListingPageProps) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
  const listingId = parseInt(id);

  if (isNaN(listingId)) {
    notFound();
  }

  let listing;
  try {
    listing = await getListing(listingId);
  } catch (error) {
    console.error("Error fetching listing:", error);
    notFound();
  }

  if (!listing || !listing.isPublished) {
    notFound();
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">{listing.title}</h1>
      <p className="text-gray-600 mt-2">{listing.description}</p>
      <p className="text-lg font-semibold mt-4">${listing.pricePerNight}/night</p>
    </div>
  );
}
