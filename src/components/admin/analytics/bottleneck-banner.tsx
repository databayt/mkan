import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import type { SectionProps } from "./types";
import { fill } from "./types";

/**
 * The one-sentence answer.
 *
 * Deterministic — the stage comes from `diagnose()` walking the funnel top-down,
 * with no model involved. The banner shows the number that triggered it next to
 * the threshold it missed, so the reader can disagree with the rule rather than
 * having to trust it.
 */
type Copy = { key: string; tone: "warn" | "ok" | "unknown" };

const UNKNOWN: Copy = { key: "diagInsufficient", tone: "unknown" };

const COPY: Record<string, Copy> = {
  supply: { key: "diagSupply", tone: "warn" },
  demand: { key: "diagDemand", tone: "warn" },
  "listing-quality": { key: "diagListingQuality", tone: "warn" },
  response: { key: "diagResponse", tone: "warn" },
  closing: { key: "diagClosing", tone: "warn" },
  healthy: { key: "diagHealthy", tone: "ok" },
  "insufficient-data": UNKNOWN,
};

export function BottleneckBanner({ data, labels, locale }: SectionProps) {
  const { stage, observed, threshold } = data.diagnosis;
  const spec = COPY[stage] ?? UNKNOWN;

  const round = (v: number | null) =>
    v === null ? "—" : formatNumber(Math.round(v * 10) / 10, locale);

  const message = fill(labels[spec.key] ?? "", {
    observed: round(observed),
    threshold: round(threshold),
  });

  const Icon = spec.tone === "ok" ? CheckCircle2 : spec.tone === "unknown" ? HelpCircle : AlertTriangle;

  return (
    <Card
      className={cn(
        "border-s-4",
        spec.tone === "warn" && "border-s-amber-500",
        spec.tone === "ok" && "border-s-emerald-500",
        spec.tone === "unknown" && "border-s-muted-foreground/40",
      )}
    >
      <CardContent className="flex items-start gap-3 pt-6">
        <Icon
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            spec.tone === "warn" && "text-amber-500",
            spec.tone === "ok" && "text-emerald-500",
            spec.tone === "unknown" && "text-muted-foreground",
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{labels.diagnosisTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          <p className="mt-2 text-xs text-muted-foreground/70">{labels.thresholdsNote}</p>
        </div>
      </CardContent>
    </Card>
  );
}
