interface ListingPageProps {
  params: Promise<{
    id: string;
    lang: string;
  }>;
}

export default async function ListingPage({ params }: ListingPageProps) {
  const resolvedParams = await params;
  const { id } = resolvedParams;

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Listing {id}</h1>
      <p className="text-gray-600 mt-2">This is a test page.</p>
    </div>
  );
}
