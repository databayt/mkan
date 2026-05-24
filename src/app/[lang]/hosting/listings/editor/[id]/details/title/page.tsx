import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Type, Info } from 'lucide-react';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const TitlePage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.title;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Now, let's give your place a title"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Short titles work best. Have fun with it—you can always change it later."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="size-5" />
              {t?.cardTitle ?? "Create your title"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="title">{t?.label ?? "Title"}</Label>
              <Input
                id="title"
                placeholder={t?.placeholder ?? "Peaceful place to relax"}
                className="mt-2"
                maxLength={50}
              />
              <p className="text-sm text-muted-foreground mt-2">0/50</p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">{t?.tipTitle ?? "Title tip"}</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {t?.tipText ?? "Most hosts in your area use titles with 20-40 characters. Consider highlighting what makes your place unique, like \"Cozy mountain cabin with lake view\" or \"Modern downtown loft near restaurants.\""}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">{t?.previewTitle ?? "Preview"}</h4>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900">
                  {t?.previewSample ?? "Peaceful place to relax"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t?.previewHint ?? "This is how your title will appear to guests"}
                </p>
              </div>
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

export default TitlePage;
