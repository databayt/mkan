"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  paymentId: number;
  dict: Record<string, string>;
}

/**
 * Tenant-facing Pay button. Phase 1 stub — hooks will be replaced in Phase 3
 * (Epic P1 Stripe integration) with `createStripePaymentIntent(paymentId)`
 * followed by `<Elements>` modal mount. For now it shows a friendly toast
 * so the UI is honest about the state.
 */
export function PayButton({ paymentId, dict }: Props) {
  const [isPending, startTransition] = useTransition();

  const onPay = () => {
    startTransition(async () => {
      // Placeholder: Phase 3 will call createStripePaymentIntent(paymentId).
      toast.info(
        dict.paymentComingSoon ??
          "Card payments open in Phase 3. Contact your host for now."
      );
    });
  };

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={onPay}>
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <CreditCard className="w-4 h-4 me-1" />
      )}
      {dict.pay ?? "Pay"}
    </Button>
  );
}
