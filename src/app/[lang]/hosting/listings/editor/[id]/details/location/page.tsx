"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Info, Loader2 } from 'lucide-react';
import { getListing, updateListing } from '@/components/host/actions';
import { useDictionary } from '@/components/internationalization/dictionary-context';

const LocationPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const dict = useDictionary();
  const t = dict?.listingEditor?.location;

  const [location, setLocation] = useState({
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    latitude: 0,
    longitude: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        const listing = await getListing(parseInt(id));
        if (listing.location) {
          setLocation({
            address: listing.location.address || '',
            city: listing.location.city || '',
            state: listing.location.state || '',
            country: listing.location.country || '',
            postalCode: listing.location.postalCode || '',
            latitude: listing.location.latitude || 0,
            longitude: listing.location.longitude || 0,
          });
        }
      } catch (error) {
        console.error('Error fetching listing:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchListing();
  }, [id]);

  const handleChange = (field: string, value: string | number) => {
    setLocation(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateListing(parseInt(id), location);
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
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Where's your place located?"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Your address is only shared with guests after they've made a reservation."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-5" />
              {t?.cardTitle ?? "Location details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="address">{t?.streetAddress ?? "Street address"}</Label>
              <Input
                id="address"
                placeholder={t?.streetAddressPlaceholder ?? "123 Main Street"}
                className="mt-2"
                value={location.address}
                onChange={(e) => handleChange('address', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">{t?.city ?? "City"}</Label>
                <Input
                  id="city"
                  placeholder={t?.cityPlaceholder ?? "City"}
                  className="mt-2"
                  value={location.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="state">{t?.state ?? "State/Province"}</Label>
                <Input
                  id="state"
                  placeholder={t?.statePlaceholder ?? "State"}
                  className="mt-2"
                  value={location.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country">{t?.country ?? "Country"}</Label>
                <Input
                  id="country"
                  placeholder={t?.countryPlaceholder ?? "Country"}
                  className="mt-2"
                  value={location.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="postalCode">{t?.postalCode ?? "Postal code"}</Label>
                <Input
                  id="postalCode"
                  placeholder={t?.postalCodePlaceholder ?? "12345"}
                  className="mt-2"
                  value={location.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{t?.coordinatesTitle ?? "Coordinates (optional)"}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="latitude">{t?.latitude ?? "Latitude"}</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    placeholder={t?.coordinatePlaceholder ?? "0.0"}
                    className="mt-2"
                    value={location.latitude || ''}
                    onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="longitude">{t?.longitude ?? "Longitude"}</Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    placeholder={t?.coordinatePlaceholder ?? "0.0"}
                    className="mt-2"
                    value={location.longitude || ''}
                    onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">{t?.privacyTitle ?? "Privacy note"}</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {t?.privacyText ?? "We'll only show a general area to guests until after they book. Your exact address will only be shared once a booking is confirmed."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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

export default LocationPage;
