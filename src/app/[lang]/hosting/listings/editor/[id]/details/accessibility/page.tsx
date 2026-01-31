"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Accessibility, Info } from 'lucide-react';

const accessibilityFeatures = [
  { id: 'step-free-entrance', label: 'Step-free guest entrance', description: 'No steps or stairs to enter' },
  { id: 'wide-doorway', label: 'Wide doorway', description: 'Doorways are at least 32 inches wide' },
  { id: 'wide-hallway', label: 'Wide hallway', description: 'Hallways at least 36 inches wide' },
  { id: 'accessible-bathroom', label: 'Accessible bathroom', description: 'Roll-in shower or bath with grab bars' },
  { id: 'step-free-bedroom', label: 'Step-free bedroom access', description: 'No steps to reach the bedroom' },
  { id: 'step-free-bathroom', label: 'Step-free bathroom access', description: 'No steps to reach the bathroom' },
  { id: 'shower-chair', label: 'Shower or bath chair', description: 'Seating available in shower/bath' },
  { id: 'grab-bars', label: 'Grab bars', description: 'Installed in bathroom' },
  { id: 'toilet-grab-bars', label: 'Toilet grab bars', description: 'Bars near toilet for support' },
  { id: 'raised-toilet', label: 'Raised toilet', description: 'Higher toilet seat available' },
  { id: 'wheelchair-parking', label: 'Accessible parking', description: 'Designated accessible parking spot' },
  { id: 'elevator', label: 'Elevator', description: 'Building has elevator access' },
];

const AccessibilityPage = () => {
  const router = useRouter();
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures(prev =>
      prev.includes(featureId)
        ? prev.filter(f => f !== featureId)
        : [...prev, featureId]
    );
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Accessibility features</h1>
          <p className="text-muted-foreground">
            Help guests with accessibility needs find your place by highlighting these features.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Accessibility className="size-5" />
              Select available features
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {accessibilityFeatures.map((feature) => (
                <div
                  key={feature.id}
                  onClick={() => toggleFeature(feature.id)}
                  className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedFeatures.includes(feature.id)
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Checkbox
                    checked={selectedFeatures.includes(feature.id)}
                    onCheckedChange={() => toggleFeature(feature.id)}
                  />
                  <div className="flex-1">
                    <Label className="font-medium cursor-pointer">{feature.label}</Label>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Why this matters</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Providing accurate accessibility information helps guests with disabilities find suitable accommodations. Be honest about what features are available to ensure a positive experience for all guests.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          <Button>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityPage;
