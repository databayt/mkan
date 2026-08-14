"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import type { AnalyticsLabels } from "./types";

/**
 * Period selector. Writes the range to the URL rather than to component state
 * so the dashboard is linkable and shareable — "the 90-day view" is a URL
 * someone can paste into a message, which is most of what a management
 * dashboard is used for.
 */
export function RangeTabs({
  labels,
  active,
}: {
  labels: AnalyticsLabels;
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const options = [
    { key: "7d", label: labels.range7d },
    { key: "30d", label: labels.range30d },
    { key: "90d", label: labels.range90d },
  ];

  function select(key: string) {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("range", key);
    next.delete("from");
    next.delete("to");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border bg-muted/40 p-1",
        pending && "opacity-60",
      )}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => select(o.key)}
          aria-pressed={active === o.key}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === o.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
