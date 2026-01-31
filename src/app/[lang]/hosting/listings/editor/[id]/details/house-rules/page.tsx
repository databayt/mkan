"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollText, Info, Cigarette, PawPrint, Music, Clock } from 'lucide-react';

const HouseRulesPage = () => {
  const router = useRouter();
  const [rules, setRules] = useState({
    smokingAllowed: false,
    petsAllowed: false,
    partiesAllowed: false,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    additionalRules: '',
  });

  const handleChange = (field: string, value: string | boolean) => {
    setRules(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Set your house rules</h1>
          <p className="text-muted-foreground">
            Let guests know what's allowed and what's not at your place.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-5" />
              Standard rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Cigarette className="size-5 text-gray-600" />
                <div>
                  <Label className="text-base font-medium">Smoking allowed</Label>
                  <p className="text-sm text-muted-foreground">Guests can smoke inside</p>
                </div>
              </div>
              <Switch
                checked={rules.smokingAllowed}
                onCheckedChange={(checked) => handleChange('smokingAllowed', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <PawPrint className="size-5 text-gray-600" />
                <div>
                  <Label className="text-base font-medium">Pets allowed</Label>
                  <p className="text-sm text-muted-foreground">Guests can bring pets</p>
                </div>
              </div>
              <Switch
                checked={rules.petsAllowed}
                onCheckedChange={(checked) => handleChange('petsAllowed', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-3">
                <Music className="size-5 text-gray-600" />
                <div>
                  <Label className="text-base font-medium">Parties/events allowed</Label>
                  <p className="text-sm text-muted-foreground">Guests can host gatherings</p>
                </div>
              </div>
              <Switch
                checked={rules.partiesAllowed}
                onCheckedChange={(checked) => handleChange('partiesAllowed', checked)}
              />
            </div>

            <div className="p-4 border rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="size-5 text-gray-600" />
                  <div>
                    <Label className="text-base font-medium">Quiet hours</Label>
                    <p className="text-sm text-muted-foreground">Set quiet time for guests</p>
                  </div>
                </div>
                <Switch
                  checked={rules.quietHoursEnabled}
                  onCheckedChange={(checked) => handleChange('quietHoursEnabled', checked)}
                />
              </div>

              {rules.quietHoursEnabled && (
                <div className="flex gap-4 pt-2">
                  <div className="flex-1">
                    <Label htmlFor="quietStart">Start time</Label>
                    <Input
                      id="quietStart"
                      type="time"
                      value={rules.quietHoursStart}
                      onChange={(e) => handleChange('quietHoursStart', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex-1">
                    <Label htmlFor="quietEnd">End time</Label>
                    <Input
                      id="quietEnd"
                      type="time"
                      value={rules.quietHoursEnd}
                      onChange={(e) => handleChange('quietHoursEnd', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Add any other rules or important information for guests..."
              className="min-h-[120px]"
              value={rules.additionalRules}
              onChange={(e) => handleChange('additionalRules', e.target.value)}
              maxLength={1000}
            />
            <p className="text-sm text-muted-foreground mt-2">{rules.additionalRules.length}/1000</p>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Why rules matter</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Clear house rules help set expectations and prevent misunderstandings. Guests who book agree to follow your rules.
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

export default HouseRulesPage;
