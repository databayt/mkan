"use client";
// i18n-exempt-file — internal Loading-component showcase; not imported by any
// route or component (zero importers in src/), never user-facing.

import React, { useState } from "react";
import Loading from "./loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const LoadingExamples = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isInlineLoading, setIsInlineLoading] = useState(false);

  const simulateLoading = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 3000);
  };

  const simulateInlineLoading = () => {
    setIsInlineLoading(true);
    setTimeout(() => setIsInlineLoading(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Loading Component Examples</h2>
      
      {/* Fullscreen Loading Example */}
      <Card>
        <CardHeader>
          <CardTitle>Fullscreen Loading</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={simulateLoading} disabled={isLoading}>
            {isLoading ? "Loading..." : "Show Fullscreen Loading"}
          </Button>
          {isLoading && <Loading variant="fullscreen" text="Processing your request..." />}
        </CardContent>
      </Card>

      {/* Inline Loading Example */}
      <Card>
        <CardHeader>
          <CardTitle>Inline Loading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={simulateInlineLoading} disabled={isInlineLoading}>
            {isInlineLoading ? (
              <div className="flex items-center gap-2">
                <Loading variant="inline" size="sm" />
                <span>Saving...</span>
              </div>
            ) : (
              "Save Data"
            )}
          </Button>
          
          <div className="flex gap-4">
            <Loading variant="inline" size="sm" text="Small" />
            <Loading variant="inline" size="md" text="Medium" />
            <Loading variant="inline" size="lg" text="Large" />
          </div>
        </CardContent>
      </Card>

      {/* Overlay Loading Example */}
      <Card>
        <CardHeader>
          <CardTitle>Overlay Loading</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative border rounded-lg p-4 h-32 bg-gray-50">
            <p>This is some content that will be covered by the overlay loading.</p>
            <p>You can still see the content structure behind the loading overlay.</p>
            <Loading variant="overlay" text="Updating content..." />
          </div>
        </CardContent>
      </Card>

      {/* Different Sizes */}
      <Card>
        <CardHeader>
          <CardTitle>Different Sizes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <Loading variant="inline" size="sm" />
              <p className="text-sm mt-2">Small</p>
            </div>
            <div className="text-center">
              <Loading variant="inline" size="md" />
              <p className="text-sm mt-2">Medium</p>
            </div>
            <div className="text-center">
              <Loading variant="inline" size="lg" />
              <p className="text-sm mt-2">Large</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 