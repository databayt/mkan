"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, DoorOpen, Building } from 'lucide-react';
import { HostStepLayout, SelectionCard } from '@/components/host';
import { useHostValidation } from '@/context/host-validation-context';

interface PrivacyTypePageProps {
  params: Promise<{ id: string }>;
}

const PrivacyTypePage = ({ params }: PrivacyTypePageProps) => {
  const router = useRouter();
  const [id, setId] = React.useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('entire-place');
  const { enableNext } = useHostValidation();

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  // Enable next button since we have a default selection
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  const privacyTypes = [
    {
      id: 'entire-place',
      title: 'An entire place',
      description: 'Guests have the whole place to themselves.',
      icon: Home,
    },
    {
      id: 'room',
      title: 'A room',
      description: 'Guests have their own room in a home, plus access to shared spaces.',
      icon: DoorOpen,
    },
    {
      id: 'shared-room',
      title: 'A shared room in a hostel',
      description: 'Guests sleep in a shared room in a professionally managed hostel with staff onsite 24/7.',
      icon: Building,
    },
  ];

  return (
    <HostStepLayout
      title={
        <h3>What type of <br /> place will guests have?</h3>
      }
    >
      <div className="space-y-3">
        {privacyTypes.map((type) => (
          <SelectionCard
            key={type.id}
            id={type.id}
            title={type.title}
            description={type.description}
            icon={<type.icon size={24} />}
            isSelected={selectedType === type.id}
            onClick={setSelectedType}
          />
        ))}
      </div>
    </HostStepLayout>
  );
};

export default PrivacyTypePage; 