import React from "react";
import { cn } from "@/lib/utils";

interface LoadingProps {
  variant?: "fullscreen" | "inline" | "overlay";
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

const Loading: React.FC<LoadingProps> = ({ 
  variant = "fullscreen", 
  size = "md", 
  text,
  className 
}) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-9 h-9", 
    lg: "w-12 h-12"
  };

  const spinner = (
    <div className={cn(
      "border-2 border-foreground/20 border-t-foreground rounded-full animate-spin",
      sizeClasses[size]
    )} />
  );

  if (variant === "fullscreen") {
    return (
      <div className={cn("fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm", className)} role="status" aria-label={text || "Loading"}>
        <div className="flex flex-col items-center gap-4">
          {spinner}
          {text && <p className="text-sm text-muted-foreground">{text}</p>}
        </div>
      </div>
    );
  }

  if (variant === "overlay") {
    return (
      <div className={cn("absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm", className)} role="status" aria-label={text || "Loading"}>
        <div className="flex flex-col items-center gap-4">
          {spinner}
          {text && <p className="text-sm text-muted-foreground">{text}</p>}
        </div>
      </div>
    );
  }

  // inline variant
  return (
    <div className={cn("flex flex-col items-center gap-2", className)} role="status" aria-label={text || "Loading"}>
      {spinner}
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
};

export default Loading; 