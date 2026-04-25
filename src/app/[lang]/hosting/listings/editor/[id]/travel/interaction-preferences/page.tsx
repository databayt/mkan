import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Handshake, Clock } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const InteractionPreferencesPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Interaction preferences</h1>
          <p className="text-muted-foreground">
            How available do you want to be? Set expectations so guests don&apos;t over-message you.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="size-5" />
              Your style
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { id: "always", label: "Always available", hint: "Reply within an hour, every day" },
              { id: "on_request", label: "On request", hint: "Reply when guests message" },
              { id: "minimal", label: "Minimal contact", hint: "Self-service stay, no chit-chat" },
            ].map((s) => (
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
              Response time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="hour" className="font-medium">
                Within an hour
              </Label>
              <Switch id="hour" defaultChecked />
            </div>
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="few" className="font-medium">
                Within a few hours
              </Label>
              <Switch id="few" />
            </div>
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="day" className="font-medium">
                Within a day
              </Label>
              <Switch id="day" />
            </div>
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

export default InteractionPreferencesPage;
