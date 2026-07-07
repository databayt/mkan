"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { verifyOffice, unverifyOffice } from "@/lib/actions/admin-actions";

interface VerifyOfficeButtonProps {
  officeId: number;
  isVerified: boolean;
  labels: {
    verify: string;
    unverify: string;
    verifying: string;
    verifiedToast: string;
    unverifiedToast: string;
    error: string;
  };
}

export function VerifyOfficeButton({
  officeId,
  isVerified,
  labels,
}: VerifyOfficeButtonProps) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const onClick = () => {
    start(async () => {
      try {
        if (isVerified) {
          await unverifyOffice(officeId);
          toast.success(labels.unverifiedToast);
        } else {
          await verifyOffice(officeId);
          toast.success(labels.verifiedToast);
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : labels.error);
      }
    });
  };

  return (
    <Button
      variant={isVerified ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={onClick}
    >
      {pending
        ? labels.verifying
        : isVerified
          ? labels.unverify
          : labels.verify}
    </Button>
  );
}
