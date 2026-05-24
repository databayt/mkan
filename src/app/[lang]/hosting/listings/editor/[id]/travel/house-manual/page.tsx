import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BookOpen } from "lucide-react";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

const HouseManualPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.houseManual;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "House manual"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "How does the AC work? Where's the trash? Save guests from texting you with the same questions."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              {t?.cardTitle ?? "Manual"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="manual">{t?.notesLabel ?? "Free-form notes"}</Label>
              <Textarea
                id="manual"
                rows={12}
                className="mt-2"
                placeholder={t?.notesPlaceholder ?? "AC remote: the white one on the kitchen counter. Set to 24°C for comfort.\nTrash: the bins are downstairs in the car park, near the lift. Recyclables are blue.\nWifi: details on the fridge magnet."}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t?.visibilityNote ?? "Visible only to guests with confirmed bookings, after they pay."}
            </p>
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

export default HouseManualPage;
