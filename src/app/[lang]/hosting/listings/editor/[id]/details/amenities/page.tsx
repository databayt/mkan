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

const amenityOptions = [
  { value: 'WiFi', label: 'WiFi', icon: Wifi, description: 'High-speed wireless internet' },
  { value: 'AirConditioning', label: 'Air Conditioning', icon: Thermometer, description: 'Central air or window units' },
  { value: 'Parking', label: 'Free Parking', icon: Car, description: 'On-site parking available' },
  { value: 'Pool', label: 'Pool', icon: Waves, description: 'Private or shared pool access' },
  { value: 'Gym', label: 'Gym', icon: Dumbbell, description: 'Fitness center access' },
  { value: 'PetsAllowed', label: 'Pets Allowed', icon: PawPrint, description: 'Pet-friendly property' },
  { value: 'WasherDryer', label: 'Washer/Dryer', icon: Waves, description: 'In-unit laundry' },
  { value: 'Dishwasher', label: 'Dishwasher', icon: Waves, description: 'Dishwasher available' },
  { value: 'HighSpeedInternet', label: 'High-Speed Internet', icon: Wifi, description: 'Fast broadband connection' },
  { value: 'HardwoodFloors', label: 'Hardwood Floors', icon: Waves, description: 'Beautiful hardwood throughout' },
  { value: 'WalkInClosets', label: 'Walk-In Closets', icon: Waves, description: 'Spacious closet storage' },
  { value: 'Microwave', label: 'Microwave', icon: Waves, description: 'Kitchen microwave' },
  { value: 'Refrigerator', label: 'Refrigerator', icon: Thermometer, description: 'Full-size refrigerator' },
];

const AmenitiesPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

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
          <h1 className="text-3xl font-semibold mb-2">What amenities do you offer?</h1>
          <p className="text-muted-foreground">
            Select all the amenities available at your property. Guests use these to filter their search.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Amenities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {amenityOptions.map((amenity) => {
                const IconComponent = amenity.icon;
                const isSelected = selectedAmenities.includes(amenity.value as Amenity);

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
                      <Label className="font-medium cursor-pointer">{amenity.label}</Label>
                      <p className="text-sm text-muted-foreground">{amenity.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Selected amenities: {selectedAmenities.length}</h4>
          <div className="flex flex-wrap gap-2">
            {selectedAmenities.map(amenity => (
              <span key={amenity} className="px-3 py-1 bg-white border rounded-full text-sm">
                {amenityOptions.find(a => a.value === amenity)?.label || amenity}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 mr-2 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AmenitiesPage;
