import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wifi, EyeOff } from 'lucide-react';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const WifiDetailsPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.wifiDetails;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Add your wifi details"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Help guests connect to your wifi easily by providing the network name and password."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="size-5" />
              {t?.cardTitle ?? "Wifi information"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="network-name">{t?.networkName ?? "Network name (SSID)"}</Label>
              <Input
                id="network-name"
                placeholder={t?.networkNamePlaceholder ?? "MyWifiNetwork"}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password">{t?.password ?? "Password"}</Label>
              <div className="relative mt-2">
                <Input
                  id="password"
                  type="password"
                  placeholder={t?.passwordPlaceholder ?? "Enter wifi password"}
                  className="pe-10"
                />
                <button className="absolute end-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
                  <EyeOff className="size-4" />
                </button>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">{t?.instructionsTitle ?? "Guest instructions"}</h4>
              <p className="text-sm text-blue-700">
                {t?.instructionsText ?? "These details will be shared with guests after they check in. Make sure your wifi information is accurate and up to date."}
              </p>
            </div>
          </CardContent>
        </Card>

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

export default WifiDetailsPage;
