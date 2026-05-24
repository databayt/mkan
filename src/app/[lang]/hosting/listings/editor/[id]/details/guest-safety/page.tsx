"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Shield, AlertTriangle, Info, Flame, Activity, Camera, Dog } from 'lucide-react';
import { useDictionary } from '@/components/internationalization/dictionary-context';

const safetyDevices = [
  { id: 'smoke-alarm', key: 'smokeAlarm', label: 'Smoke alarm', icon: Flame, description: 'Working smoke detector installed' },
  { id: 'carbon-monoxide', key: 'carbonMonoxide', label: 'Carbon monoxide alarm', icon: Activity, description: 'CO detector installed' },
  { id: 'fire-extinguisher', key: 'fireExtinguisher', label: 'Fire extinguisher', icon: Flame, description: 'Accessible fire extinguisher' },
  { id: 'first-aid', key: 'firstAid', label: 'First aid kit', icon: Activity, description: 'First aid supplies available' },
  { id: 'security-camera', key: 'securityCamera', label: 'Security camera/recording device', icon: Camera, description: 'Outdoor cameras present' },
] as const;

const potentialHazards = [
  { id: 'pool', key: 'pool', label: 'Pool/hot tub without gate or lock', description: 'Unfenced water feature' },
  { id: 'lake', key: 'lake', label: 'Lake, river, or other body of water nearby', description: 'Natural water nearby' },
  { id: 'heights', key: 'heights', label: 'Heights without rails or protection', description: 'Balconies, lofts, or rooftops' },
  { id: 'animals', key: 'animals', label: 'Dangerous animals on property', description: 'Livestock or wildlife' },
  { id: 'stairs', key: 'stairs', label: 'Steep stairs', description: 'Stairs that may be challenging' },
  { id: 'weapons', key: 'weapons', label: 'Weapons on property', description: 'Firearms or other weapons stored' },
] as const;

const GuestSafetyPage = () => {
  const router = useRouter();
  const dict = useDictionary();
  const t = dict?.listingEditor?.guestSafety;
  const dev = t?.devices as Record<string, string> | undefined;
  const haz = t?.hazards as Record<string, string> | undefined;
  const [devices, setDevices] = useState<string[]>([]);
  const [hazards, setHazards] = useState<string[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState('');

  const toggleDevice = (deviceId: string) => {
    setDevices(prev =>
      prev.includes(deviceId)
        ? prev.filter(d => d !== deviceId)
        : [...prev, deviceId]
    );
  };

  const toggleHazard = (hazardId: string) => {
    setHazards(prev =>
      prev.includes(hazardId)
        ? prev.filter(h => h !== hazardId)
        : [...prev, hazardId]
    );
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Guest safety"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Help guests understand safety features and potential hazards at your place."}
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" />
              {t?.devicesTitle ?? "Safety devices"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t?.devicesHint ?? "Select all the safety devices available at your property."}
            </p>
            <div className="space-y-3">
              {safetyDevices.map((device) => {
                const IconComponent = device.icon;
                return (
                  <div
                    key={device.id}
                    onClick={() => toggleDevice(device.id)}
                    className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                      devices.includes(device.id)
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Checkbox
                      checked={devices.includes(device.id)}
                      onCheckedChange={() => toggleDevice(device.id)}
                    />
                    <IconComponent className="size-5 text-gray-600" />
                    <div className="flex-1">
                      <Label className="font-medium cursor-pointer">{dev?.[device.key] ?? device.label}</Label>
                      <p className="text-sm text-muted-foreground">{dev?.[`${device.key}Desc`] ?? device.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              {t?.hazardsTitle ?? "Potential hazards"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {t?.hazardsHint ?? "Let guests know about any potential hazards so they can make an informed decision."}
            </p>
            <div className="space-y-3">
              {potentialHazards.map((hazard) => (
                <div
                  key={hazard.id}
                  onClick={() => toggleHazard(hazard.id)}
                  className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                    hazards.includes(hazard.id)
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Checkbox
                    checked={hazards.includes(hazard.id)}
                    onCheckedChange={() => toggleHazard(hazard.id)}
                  />
                  <div className="flex-1">
                    <Label className="font-medium cursor-pointer">{haz?.[hazard.key] ?? hazard.label}</Label>
                    <p className="text-sm text-muted-foreground">{haz?.[`${hazard.key}Desc`] ?? hazard.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t?.additionalTitle ?? "Additional safety information"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={t?.additionalPlaceholder ?? "Add any other safety information guests should know about..."}
              className="min-h-[100px]"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              maxLength={500}
            />
            <p className="text-sm text-muted-foreground mt-2">{additionalInfo.length}/500</p>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">{t?.whyTitle ?? "Why transparency matters"}</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {t?.whyText ?? "Being upfront about safety features and hazards builds trust with guests and helps them prepare for their stay. It also protects you as a host."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            {dict?.common?.back ?? "Back"}
          </Button>
          <Button>
            {dict?.common?.save ?? "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GuestSafetyPage;
