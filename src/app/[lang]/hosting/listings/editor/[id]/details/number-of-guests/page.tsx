import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Bed, BedDouble, Bath } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface CounterFieldProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  defaultValue: number;
  min: number;
}

function CounterField({ icon, label, hint, defaultValue, min }: CounterFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="text-muted-foreground mt-1">{icon}</div>
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" aria-label={`Decrease ${label}`}>
          –
        </Button>
        <span className="w-8 text-center font-medium">{defaultValue}</span>
        <Button type="button" variant="outline" size="icon" aria-label={`Increase ${label}`}>
          +
        </Button>
      </div>
    </div>
  );
}

const NumberOfGuestsPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Capacity</h1>
          <p className="text-muted-foreground">
            How many guests can your place accommodate? Set the limits guests will see at search.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Guests, bedrooms, beds, and baths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <CounterField
              icon={<Users className="size-5" />}
              label="Guests"
              hint="Max overnight guests including children"
              defaultValue={2}
              min={1}
            />
            <CounterField
              icon={<Bed className="size-5" />}
              label="Bedrooms"
              hint="Separate sleeping rooms"
              defaultValue={1}
              min={0}
            />
            <CounterField
              icon={<BedDouble className="size-5" />}
              label="Beds"
              hint="All beds including sofa beds"
              defaultValue={1}
              min={1}
            />
            <CounterField
              icon={<Bath className="size-5" />}
              label="Bathrooms"
              hint="Full or shared bathrooms"
              defaultValue={1}
              min={0}
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

export default NumberOfGuestsPage;
