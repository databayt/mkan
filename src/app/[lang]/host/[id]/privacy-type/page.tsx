"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home, DoorOpen, Building } from 'lucide-react';
import HostStepLayout from '@/components/host/host-step-layout';
import SelectionCard from '@/components/host/selection-card';
import { useHostValidation } from '@/context/onboarding-validation-context';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface PrivacyTypePageProps {
  params: Promise<{ id: string }>;
}

const PrivacyTypePage = ({ params }: PrivacyTypePageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
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
      title: dict.hosting.pages.privacyType.entirePlace,
      description: dict.hosting.pages.privacyType.entirePlaceDescription,
      icon: Home,
    },
    {
      id: 'room',
      title: dict.hosting.pages.privacyType.room,
      description: dict.hosting.pages.privacyType.roomDescription,
      icon: DoorOpen,
    },
    {
      id: 'shared-room',
      title: dict.hosting.pages.privacyType.sharedRoom,
      description: dict.hosting.pages.privacyType.sharedRoomDescription,
      icon: Building,
    },
  ];

  return (
    <HostStepLayout
      title={
        <h3>{dict.hosting.pages.privacyType.title}</h3>
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