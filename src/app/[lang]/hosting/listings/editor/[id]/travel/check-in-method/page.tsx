import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KeyRound } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

const methods = [
  { id: "smart_lock", label: "Smart lock", hint: "Code-based entry" },
  { id: "lockbox", label: "Lockbox", hint: "Key inside a coded box" },
  { id: "in_person", label: "In person", hint: "You greet the guest" },
  { id: "doorman", label: "Doorman", hint: "Front-desk hands over key" },
  { id: "self_check_in", label: "Self check-in", hint: "Guest opens with code only" },
];

const CheckInMethodPage = async ({ params }: PageProps) => {
  await params;

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Check-in method</h1>
          <p className="text-muted-foreground">
            How will your guests get inside? Pick a method and add custom instructions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              Pick a method
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {methods.map((m) => (
              <label
                key={m.id}
                className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/30 cursor-pointer"
              >
                <input type="radio" name="checkin" value={m.id} className="mt-1" />
                <div>
                  <p className="font-medium">{m.label}</p>
                  <p className="text-sm text-muted-foreground">{m.hint}</p>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Custom instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="instructions">Instructions for guests</Label>
            <Textarea
              id="instructions"
              className="mt-2"
              rows={5}
              placeholder="Sample: The lockbox is to the left of the front door. Code is 1234."
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

export default CheckInMethodPage;
