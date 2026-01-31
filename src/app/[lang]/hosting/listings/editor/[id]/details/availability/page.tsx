"use client";

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar, Info, Clock, CalendarDays } from 'lucide-react';

const AvailabilityPage = () => {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [availability, setAvailability] = useState({
    minStay: 1,
    maxStay: 365,
    advanceNotice: 1,
    preparationTime: 0,
    availabilityWindow: 12,
    allowSameDayBooking: true,
  });

  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  const handleChange = (field: string, value: number | boolean) => {
    setAvailability(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Availability settings</h1>
          <p className="text-muted-foreground">
            Control when and how guests can book your place.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="size-5" />
              Trip length
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minStay">Minimum nights</Label>
                <Input
                  id="minStay"
                  type="number"
                  min={1}
                  max={365}
                  className="mt-2"
                  value={availability.minStay}
                  onChange={(e) => handleChange('minStay', parseInt(e.target.value) || 1)}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Shortest stay allowed
                </p>
              </div>
              <div>
                <Label htmlFor="maxStay">Maximum nights</Label>
                <Input
                  id="maxStay"
                  type="number"
                  min={1}
                  max={365}
                  className="mt-2"
                  value={availability.maxStay}
                  onChange={(e) => handleChange('maxStay', parseInt(e.target.value) || 365)}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Longest stay allowed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5" />
              Booking settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="advanceNotice">Advance notice</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="advanceNotice"
                  type="number"
                  min={0}
                  max={30}
                  className="w-24"
                  value={availability.advanceNotice}
                  onChange={(e) => handleChange('advanceNotice', parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground">day(s) before check-in</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                How much notice you need before a guest arrives
              </p>
            </div>

            <div>
              <Label htmlFor="preparationTime">Preparation time</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="preparationTime"
                  type="number"
                  min={0}
                  max={7}
                  className="w-24"
                  value={availability.preparationTime}
                  onChange={(e) => handleChange('preparationTime', parseInt(e.target.value) || 0)}
                />
                <span className="text-sm text-muted-foreground">day(s) between bookings</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Buffer time for cleaning between guests
              </p>
            </div>

            <div>
              <Label htmlFor="availabilityWindow">Availability window</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="availabilityWindow"
                  type="number"
                  min={1}
                  max={24}
                  className="w-24"
                  value={availability.availabilityWindow}
                  onChange={(e) => handleChange('availabilityWindow', parseInt(e.target.value) || 12)}
                />
                <span className="text-sm text-muted-foreground">months in advance</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                How far in advance guests can book
              </p>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="text-base font-medium">Same-day booking</Label>
                <p className="text-sm text-muted-foreground">
                  Allow guests to book for today
                </p>
              </div>
              <Switch
                checked={availability.allowSameDayBooking}
                onCheckedChange={(checked) => handleChange('allowSameDayBooking', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-5" />
              Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Calendar className="size-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-medium mb-2">Calendar view coming soon</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                A full calendar will be available here to block dates, set seasonal pricing, and sync with external calendars.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Availability tip</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Keeping your calendar up to date helps you avoid double bookings and ensures guests can find available dates. Consider syncing with external calendars if you list on multiple platforms.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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

export default AvailabilityPage;
