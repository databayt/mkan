import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Compass, Plus } from "lucide-react";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const GuidebooksPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.guidebooks;

  const samples = [
    {
      name: t?.sample1Name ?? "Beit Al-Ghada",
      address: t?.sample1Address ?? "Al-Geyf Al-Sharqi, Port Sudan",
      note: t?.sample1Note ?? "Best traditional Sudanese breakfast — open from 7 AM",
    },
    {
      name: t?.sample2Name ?? "Marina Mall",
      address: t?.sample2Address ?? "Shari'a Al-Bahr, Port Sudan",
      note: t?.sample2Note ?? "Largest shopping mall, free parking, ATMs available",
    },
  ];

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Guidebook"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Recommend nearby places to your guests. Restaurants, cafés, attractions, services."}
          </p>
        </div>

        <div className="space-y-4">
          {samples.map((s, i) => (
            <Card key={i}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Compass className="size-5" />
                  {s.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t?.address ?? "Address"}</Label>
                  <Input defaultValue={s.address} className="mt-2" />
                </div>
                <div>
                  <Label>{t?.note ?? "Note"}</Label>
                  <Textarea defaultValue={s.note} className="mt-2" rows={2} />
                </div>
                <Button variant="outline" size="sm">
                  {dict?.listingEditor?.common?.remove ?? "Remove"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" className="mt-4">
          <Plus className="size-4 me-2" />
          {t?.addPlace ?? "Add a place"}
        </Button>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">{dict?.common?.back ?? "Back"}</Button>
          <Button>{dict?.common?.save ?? "Save"}</Button>
        </div>
      </div>
    </div>
  );
};

export default GuidebooksPage;
