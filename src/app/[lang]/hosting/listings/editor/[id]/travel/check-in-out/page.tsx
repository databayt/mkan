import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Calendar } from 'lucide-react';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const CheckInOutPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.checkInOut;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Set your check-in and checkout times"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Choose times that work for both you and your guests."}
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5" />
                {t?.checkInTitle ?? "Check-in time"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t?.from ?? "From"}</label>
                  <select className="w-full p-2 border border-gray-300 rounded-md">
                    <option value="14:00">{t?.time1400 ?? "2:00 PM"}</option>
                    <option value="15:00">{t?.time1500 ?? "3:00 PM"}</option>
                    <option value="16:00">{t?.time1600 ?? "4:00 PM"}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t?.until ?? "Until"}</label>
                  <select className="w-full p-2 border border-gray-300 rounded-md">
                    <option value="20:00">{t?.time2000 ?? "8:00 PM"}</option>
                    <option value="21:00">{t?.time2100 ?? "9:00 PM"}</option>
                    <option value="22:00">{t?.time2200 ?? "10:00 PM"}</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="size-5" />
                {t?.checkOutTitle ?? "Checkout time"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <label className="block text-sm font-medium mb-2">{t?.before ?? "Before"}</label>
                <select className="w-full p-2 border border-gray-300 rounded-md">
                  <option value="10:00">{t?.time1000 ?? "10:00 AM"}</option>
                  <option value="11:00">{t?.time1100 ?? "11:00 AM"}</option>
                  <option value="12:00">{t?.time1200 ?? "12:00 PM"}</option>
                </select>
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

export default CheckInOutPage;
