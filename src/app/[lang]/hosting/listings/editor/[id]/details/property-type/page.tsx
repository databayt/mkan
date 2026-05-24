import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Home, Building, TreePine, Tent } from 'lucide-react';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const PropertyTypePage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.propertyType;

  const propertyTypes = [
    {
      icon: Home,
      title: t?.houseTitle ?? 'House',
      description: t?.houseDesc ?? 'A home that may be detached or attached to other units',
      selected: true
    },
    {
      icon: Building,
      title: t?.apartmentTitle ?? 'Apartment',
      description: t?.apartmentDesc ?? 'A place within a multi-unit residential building or complex',
      selected: false
    },
    {
      icon: TreePine,
      title: t?.cabinTitle ?? 'Cabin',
      description: t?.cabinDesc ?? 'A home made of wood and located in a natural setting',
      selected: false
    },
    {
      icon: Tent,
      title: t?.campingTitle ?? 'Camping',
      description: t?.campingDesc ?? 'An outdoor accommodation with tents or similar structures',
      selected: false
    },
  ];

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "What type of place will guests have?"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Choose the option that best describes your place."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t?.cardTitle ?? "Property type"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {propertyTypes.map((type, index) => {
                const IconComponent = type.icon;
                return (
                  <div 
                    key={index}
                    className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                      type.selected 
                        ? 'border-black bg-gray-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <IconComponent className="size-6 text-gray-600" />
                    <div className="flex-1">
                      <h3 className="font-medium">{type.title}</h3>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>{t?.spaceTitle ?? "What type of space will guests have?"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-4 border border-black rounded-lg bg-gray-50">
                  <div className="flex-1">
                    <h3 className="font-medium">{t?.entirePlaceTitle ?? "An entire place"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t?.entirePlaceDesc ?? "Guests have the whole place to themselves"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300">
                  <div className="flex-1">
                    <h3 className="font-medium">{t?.roomTitle ?? "A room"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t?.roomDesc ?? "Guests have their own room in a home, plus access to shared spaces"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300">
                  <div className="flex-1">
                    <h3 className="font-medium">{t?.sharedRoomTitle ?? "A shared room"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t?.sharedRoomDesc ?? "Guests sleep in a room or common area that may be shared with you or others"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">
            {dict?.common?.back ?? "Back"}
          </Button>
          <Button>
            {dict?.common?.next ?? "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PropertyTypePage;
