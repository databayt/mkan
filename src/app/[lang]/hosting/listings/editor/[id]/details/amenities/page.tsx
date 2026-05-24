"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Wifi, Car, Dumbbell, Waves, Thermometer, PawPrint } from 'lucide-react';
import { getListing, updateListing } from '@/components/host/actions';
import { Amenity } from '@prisma/client';
import { useDictionary } from '@/components/internationalization/dictionary-context';

const amenityOptions = [
  { value: 'WiFi', key: 'wifi', label: 'WiFi', icon: Wifi, description: 'High-speed wireless internet' },
  { value: 'AirConditioning', key: 'airConditioning', label: 'Air Conditioning', icon: Thermometer, description: 'Central air or window units' },
  { value: 'Parking', key: 'parking', label: 'Free Parking', icon: Car, description: 'On-site parking available' },
  { value: 'Pool', key: 'pool', label: 'Pool', icon: Waves, description: 'Private or shared pool access' },
  { value: 'Gym', key: 'gym', label: 'Gym', icon: Dumbbell, description: 'Fitness center access' },
  { value: 'PetsAllowed', key: 'petsAllowed', label: 'Pets Allowed', icon: PawPrint, description: 'Pet-friendly property' },
  { value: 'WasherDryer', key: 'washerDryer', label: 'Washer/Dryer', icon: Waves, description: 'In-unit laundry' },
  { value: 'Dishwasher', key: 'dishwasher', label: 'Dishwasher', icon: Waves, description: 'Dishwasher available' },
  { value: 'HighSpeedInternet', key: 'highSpeedInternet', label: 'High-Speed Internet', icon: Wifi, description: 'Fast broadband connection' },
  { value: 'HardwoodFloors', key: 'hardwoodFloors', label: 'Hardwood Floors', icon: Waves, description: 'Beautiful hardwood throughout' },
  { value: 'WalkInClosets', key: 'walkInClosets', label: 'Walk-In Closets', icon: Waves, description: 'Spacious closet storage' },
  { value: 'Microwave', key: 'microwave', label: 'Microwave', icon: Waves, description: 'Kitchen microwave' },
  { value: 'Refrigerator', key: 'refrigerator', label: 'Refrigerator', icon: Thermometer, description: 'Full-size refrigerator' },
] as const;

const AmenitiesPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const dict = useDictionary();
  const t = dict?.listingEditor?.amenities;
  const opts = t?.options as Record<string, string> | undefined;

  const [selectedAmenities, setSelectedAmenities] = useState<Amenity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const listing = await getListing(parseInt(id));
        setSelectedAmenities(listing.amenities || []);
      } catch (error) {
        console.error('Error fetching listing:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchListing();
  }, [id]);

  const toggleAmenity = (amenity: Amenity) => {
    setSelectedAmenities(prev =>
      prev.includes(amenity)
        ? prev.filter(a => a !== amenity)
        : [...prev, amenity]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateListing(parseInt(id), { amenities: selectedAmenities });
      router.back();
    } catch (error) {
      console.error('Error updating listing:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="lg:col-span-2 flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "What amenities do you offer?"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Select all the amenities available at your property. Guests use these to filter their search."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t?.cardTitle ?? "Amenities"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {amenityOptions.map((amenity) => {
                const IconComponent = amenity.icon;
                const isSelected = selectedAmenities.includes(amenity.value as Amenity);
                const label = opts?.[amenity.key] ?? amenity.label;
                const description = opts?.[`${amenity.key}Desc`] ?? amenity.description;

                return (
                  <div
                    key={amenity.value}
                    onClick={() => toggleAmenity(amenity.value as Amenity)}
                    className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-black bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleAmenity(amenity.value as Amenity)}
                    />
                    <IconComponent className="size-5 text-gray-600" />
                    <div className="flex-1">
                      <Label className="font-medium cursor-pointer">{label}</Label>
                      <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">{t?.selectedLabel ?? "Selected amenities:"} {selectedAmenities.length}</h4>
          <div className="flex flex-wrap gap-2">
            {selectedAmenities.map(amenity => {
              const opt = amenityOptions.find(a => a.value === amenity);
              return (
                <span key={amenity} className="px-3 py-1 bg-white border rounded-full text-sm">
                  {(opt && opts?.[opt.key]) || opt?.label || amenity}
                </span>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            {dict?.common?.back ?? "Back"}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 me-2 animate-spin" />}
            {dict?.common?.save ?? "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AmenitiesPage;
