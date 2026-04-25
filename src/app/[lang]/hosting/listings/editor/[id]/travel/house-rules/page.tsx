import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollText } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const rules = [
  { id: "smoking", label: "Smoking allowed", hint: "Set whether guests can smoke inside" },
  { id: "pets", label: "Pets allowed", hint: "Set whether guests can bring pets" },
  { id: "parties", label: "Parties or events allowed", hint: "Large gatherings on-site" },
  { id: "kids", label: "Suitable for kids", hint: "Childproofing & safety" },
  { id: "quiet_hours", label: "Quiet hours", hint: "Default 10 PM – 8 AM" },
];

const HouseRulesPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">House rules</h1>
          <p className="text-muted-foreground">
            Guests must accept these rules before booking. Be clear and reasonable.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-5" />
              Standard rules
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
            <CardTitle>Custom rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="custom">One rule per line</Label>
            <Textarea
              id="custom"
              rows={5}
              className="mt-2"
              placeholder="Please remove your shoes inside&#10;No outside guests after 10 PM"
            />
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

export default HouseRulesPage;
