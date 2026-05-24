import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollText } from "lucide-react";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const HouseRulesPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.travelHouseRules;

  const rules = [
    { id: "smoking", label: t?.smoking ?? "Smoking allowed", hint: t?.smokingHint ?? "Set whether guests can smoke inside" },
    { id: "pets", label: t?.pets ?? "Pets allowed", hint: t?.petsHint ?? "Set whether guests can bring pets" },
    { id: "parties", label: t?.parties ?? "Parties or events allowed", hint: t?.partiesHint ?? "Large gatherings on-site" },
    { id: "kids", label: t?.kids ?? "Suitable for kids", hint: t?.kidsHint ?? "Childproofing & safety" },
    { id: "quiet_hours", label: t?.quietHours ?? "Quiet hours", hint: t?.quietHoursHint ?? "Default 10 PM – 8 AM" },
  ];

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "House rules"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Guests must accept these rules before booking. Be clear and reasonable."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-5" />
              {t?.standardTitle ?? "Standard rules"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3 border-b last:border-b-0"
              >
                <div>
                  <Label htmlFor={r.id} className="font-medium">
                    {r.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{r.hint}</p>
                </div>
                <Switch id={r.id} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t?.customTitle ?? "Custom rules"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="custom">{t?.customLabel ?? "One rule per line"}</Label>
            <Textarea
              id="custom"
              rows={5}
              className="mt-2"
              placeholder={t?.customPlaceholder ?? "Please remove your shoes inside\nNo outside guests after 10 PM"}
            />
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">{dict?.common?.back ?? "Back"}</Button>
          <Button>{dict?.common?.save ?? "Save"}</Button>
        </div>
      </div>
    </div>
  );
};

export default HouseRulesPage;
