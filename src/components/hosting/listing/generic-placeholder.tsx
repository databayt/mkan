"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, ArrowLeft } from 'lucide-react';
import { useDictionary } from '@/components/internationalization/use-dictionary';

interface GenericPlaceholderProps {
  title: string;
  description: string;
  section: 'details' | 'travel';
}

const GenericPlaceholder = ({ title, description, section }: GenericPlaceholderProps) => {
  const dict = useDictionary();
  const pl = dict?.listingEditor?.placeholder;
  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{title}</h1>
          <p className="text-muted-foreground">
            {description}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="size-5" />
              {(pl?.configTitle ?? "{title} Configuration").replace("{title}", title)}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="size-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium mb-2">{title}</h3>
              <p className="text-muted-foreground mb-6">
                {(pl?.intro ?? "Configure your {title} settings for this listing.").replace("{title}", title.toLowerCase())}
              </p>
              <div className="bg-muted/30 p-4 rounded-lg text-start">
                <h4 className="font-medium mb-2">{pl?.fromSection ?? "From this section you can:"}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {(pl?.li1 ?? "Configure {title} settings").replace("{title}", title.toLowerCase())}</li>
                  <li>• {pl?.li2 ?? "Save and update your preferences"}</li>
                  <li>• {pl?.li3 ?? "Preview how it appears to guests"}</li>
                  <li>• {pl?.li4 ?? "Get recommendations and tips"}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">
            {dict?.listingEditor?.common?.back ?? "Back"}
          </Button>
          <Button>
            {dict?.listingEditor?.common?.next ?? "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GenericPlaceholder; 