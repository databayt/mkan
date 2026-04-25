import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BookOpen } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const HouseManualPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">House manual</h1>
          <p className="text-muted-foreground">
            How does the AC work? Where&apos;s the trash? Save guests from texting you with the same
            questions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5" />
              Manual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="manual">Free-form notes</Label>
              <Textarea
                id="manual"
                rows={12}
                className="mt-2"
                placeholder="AC remote: the white one on the kitchen counter. Set to 24°C for comfort.&#10;Trash: the bins are downstairs in the car park, near the lift. Recyclables are blue.&#10;Wifi: details on the fridge magnet."
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Visible only to guests with confirmed bookings, after they pay.
            </p>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">Back</Button>
          <Button>Save</Button>
        </div>
      </div>
    </div>
  );
};

export default HouseManualPage;
