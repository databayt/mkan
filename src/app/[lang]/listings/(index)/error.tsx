"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function ListingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dict = useDictionary();

  useEffect(() => {
    // Surface to monitoring; dev console picks it up via the default handler.
    console.error("Listings route error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-2xl font-semibold mb-2">
        {dict.errors?.listings?.title ?? "Something went wrong loading listings"}
      </h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        {dict.errors?.listings?.description ??
          "We couldn't fetch properties right now. Try again in a moment."}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>
          {dict.errors?.retry ?? "Try again"}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">{dict.errors?.goHome ?? "Go home"}</Link>
        </Button>
      </div>
    </div>
  );
}
