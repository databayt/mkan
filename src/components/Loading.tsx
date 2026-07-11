"use client";

import { Loader2 } from "lucide-react";
import React from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";

const Loading = () => {
  const dict = useDictionary();
  return (
    <div className="fixed inset-0 flex gap-2 items-center justify-center bg-background/50" role="status" aria-label={dict?.common?.loading ?? "Loading"}>
      <Loader2 className="w-6 h-6 animate-spin text-primary-700" aria-hidden="true" />
      <span className="text-sm font-medium text-primary-700">{dict?.common?.loading ?? "Loading..."}</span>
    </div>
  );
};

export default Loading;
