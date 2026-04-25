import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Map as MapIcon, Navigation } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const DirectionsPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Directions</h1>
          <p className="text-muted-foreground">
            Help guests find your place. Add written directions and an optional map pin.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="size-5" />
              Written directions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="directions">Directions from a landmark</Label>
            <Textarea
              id="directions"
              rows={6}
              className="mt-2"
              placeholder="From the airport, take the highway exit toward Port Sudan. Turn right at the third roundabout..."
            />
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapIcon className="size-5" />
              Map pin (optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" placeholder="19.6158" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" placeholder="37.2164" className="mt-2" />
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 h-48 flex items-center justify-center text-sm text-muted-foreground">
              Map preview appears here once coordinates are set
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

export default DirectionsPage;
