import { Loader2 } from "lucide-react";
import React from "react";

const Loading = () => {
  return (
    <div className="fixed inset-0 flex gap-2 items-center justify-center bg-background/50" role="status" aria-label="Loading">
      <Loader2 className="w-6 h-6 animate-spin text-primary-700" aria-hidden="true" />
      <span className="text-sm font-medium text-primary-700">Loading...</span>
    </div>
  );
};

export default Loading;
