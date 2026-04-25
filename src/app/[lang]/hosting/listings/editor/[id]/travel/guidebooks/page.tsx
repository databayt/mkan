import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Compass, Plus } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const samples = [
  {
    name: "Beit Al-Ghada",
    address: "Al-Geyf Al-Sharqi, Port Sudan",
    note: "Best traditional Sudanese breakfast — open from 7 AM",
  },
  {
    name: "Marina Mall",
    address: "Shari'a Al-Bahr, Port Sudan",
    note: "Largest shopping mall, free parking, ATMs available",
  },
];

const GuidebooksPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Guidebook</h1>
          <p className="text-muted-foreground">
            Recommend nearby places to your guests. Restaurants, cafés, attractions, services.
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
                  <Label>Address</Label>
                  <Input defaultValue={s.address} className="mt-2" />
                </div>
                <div>
                  <Label>Note</Label>
                  <Textarea defaultValue={s.note} className="mt-2" rows={2} />
                </div>
                <Button variant="outline" size="sm">
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" className="mt-4">
          <Plus className="size-4 me-2" />
          Add a place
        </Button>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">Back</Button>
          <Button>Save</Button>
        </div>
      </div>
    </div>
  );
};

export default GuidebooksPage;
