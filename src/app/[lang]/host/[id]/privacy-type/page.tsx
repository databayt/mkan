"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home, DoorOpen, Building } from 'lucide-react';
import HostStepLayout from '@/components/host/host-step-layout';
import SelectionCard from '@/components/host/selection-card';
import { useHostValidation } from '@/context/onboarding-validation-context';

interface PrivacyTypePageProps {
  params: Promise<{ id: string }>;
}

const PrivacyTypePage = ({ params }: PrivacyTypePageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");
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
      title: isAr ? 'مكان كامل' : 'An entire place',
      description: isAr ? 'يحصل الضيوف على المكان بالكامل لأنفسهم.' : 'Guests have the whole place to themselves.',
      icon: Home,
    },
    {
      id: 'room',
      title: isAr ? 'غرفة' : 'A room',
      description: isAr ? 'يحصل الضيوف على غرفتهم الخاصة في المنزل، بالإضافة إلى الوصول إلى المساحات المشتركة.' : 'Guests have their own room in a home, plus access to shared spaces.',
      icon: DoorOpen,
    },
    {
      id: 'shared-room',
      title: isAr ? 'غرفة مشتركة في نزل' : 'A shared room in a hostel',
      description: isAr ? 'ينام الضيوف في غرفة مشتركة في نزل مُدار باحترافية مع موظفين متواجدين على مدار الساعة.' : 'Guests sleep in a shared room in a professionally managed hostel with staff onsite 24/7.',
      icon: Building,
    },
  ];

  return (
    <HostStepLayout
      title={
        <h3>{isAr ? <>ما نوع المكان الذي <br /> سيحصل عليه الضيوف؟</> : <>What type of <br /> place will guests have?</>}</h3>
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