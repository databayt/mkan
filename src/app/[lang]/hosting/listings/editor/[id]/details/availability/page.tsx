import React from 'react';
import GenericPlaceholder from '@/components/hosting/listing/generic-placeholder';

interface PageProps {
  params: Promise<{ id: string }>;
}

const AvailabilityPage = async ({ params }: PageProps) => {
  const { id } = await params;
  
  return (
    <GenericPlaceholder
      title="Availability"
      description="Set your calendar and manage when your place is available for guests."
      section="details"
    />
  );
};

export default AvailabilityPage;
