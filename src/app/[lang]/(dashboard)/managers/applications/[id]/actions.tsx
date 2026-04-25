"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateApplicationStatus } from "@/lib/actions/application-actions";

interface Props {
  applicationId: number;
  lang: string;
  dict: Record<string, Record<string, string>>;
}

export default function ApplicationActions({ applicationId, lang, dict }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const t = (dict.dashboard as Record<string, Record<string, string>> | undefined)?.applications ?? {};

  const decide = (decision: "Approved" | "Denied") => {
    const confirmMsg =
      decision === "Approved"
        ? (t.approveConfirm ?? "Approve this application? A lease and first-month payment will be generated.")
        : (t.rejectConfirm ?? "Reject this application?");
    if (!window.confirm(confirmMsg)) return;

    startTransition(async () => {
      try {
        await updateApplicationStatus(applicationId, decision);
        toast.success(
          decision === "Approved"
            ? (t.approved ?? "Application approved")
            : (t.rejected ?? "Application rejected")
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update");
      }
    });
  };

  return (
    <div className="flex gap-3">
      <Button
        size="lg"
        className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        disabled={isPending}
        onClick={() => decide("Approved")}
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 me-2" />}
        {t.approve ?? "Approve"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="flex-1"
        disabled={isPending}
        onClick={() => decide("Denied")}
      >
        <X className="w-4 h-4 me-2" />
        {t.reject ?? "Reject"}
      </Button>
    </div>
  );
}
