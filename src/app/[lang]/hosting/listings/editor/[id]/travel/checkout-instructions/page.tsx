import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LogOut } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const CheckoutInstructionsPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Checkout instructions</h1>
          <p className="text-muted-foreground">
            Tell guests what to do when they leave — turn off the AC, lock the door, and so on.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogOut className="size-5" />
              Departure steps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="instructions">Instructions</Label>
              <Textarea
                id="instructions"
                rows={8}
                className="mt-2"
                placeholder="1. Lock the front door&#10;2. Turn off all lights and AC&#10;3. Leave keys on the kitchen counter&#10;4. Take your trash to the bin outside"
              />
            </div>
            <div className="bg-muted/30 p-4 rounded-lg text-sm text-muted-foreground">
              These instructions are sent automatically the morning of checkout.
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

export default CheckoutInstructionsPage;
