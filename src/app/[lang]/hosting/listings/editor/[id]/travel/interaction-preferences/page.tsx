import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Handshake, Clock } from "lucide-react";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const InteractionPreferencesPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.interactionPreferences;

  const styles = [
    { id: "always", label: t?.alwaysAvailable ?? "Always available", hint: t?.alwaysAvailableHint ?? "Reply within an hour, every day" },
    { id: "on_request", label: t?.onRequest ?? "On request", hint: t?.onRequestHint ?? "Reply when guests message" },
    { id: "minimal", label: t?.minimalContact ?? "Minimal contact", hint: t?.minimalContactHint ?? "Self-service stay, no chit-chat" },
  ];

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Interaction preferences"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "How available do you want to be? Set expectations so guests don't over-message you."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="size-5" />
              {t?.styleTitle ?? "Your style"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {styles.map((s) => (
              <label
                key={s.id}
                className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/30 cursor-pointer"
              >
                <input type="radio" name="style" value={s.id} className="mt-1" />
                <div>
                  <p className="font-medium">{s.label}</p>
                  <p className="text-sm text-muted-foreground">{s.hint}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5" />
              {t?.responseTimeTitle ?? "Response time"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="hour" className="font-medium">
                {t?.withinHour ?? "Within an hour"}
              </Label>
              <Switch id="hour" defaultChecked />
            </div>
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="few" className="font-medium">
                {t?.withinFewHours ?? "Within a few hours"}
              </Label>
              <Switch id="few" />
            </div>
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="day" className="font-medium">
                {t?.withinDay ?? "Within a day"}
              </Label>
              <Switch id="day" />
            </div>
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

export default InteractionPreferencesPage;
