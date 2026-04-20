"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function VerifyListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dict = useDictionary();

  useEffect(() => {
    console.error("Verify-listing route error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-2xl font-semibold mb-2">
        {dict.errors?.verifyListing?.title ?? "Couldn't load verification"}
      </h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        {dict.errors?.verifyListing?.description ??
          "We couldn't load the verification flow for this listing. Try again."}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>{dict.errors?.retry ?? "Try again"}</Button>
        <Button variant="outline" asChild>
          <a href="/hosting/listings">
            {dict.errors?.backToListings ?? "Back to listings"}
          </a>
        </Button>
      </div>
    </div>
  );
}
