"use client";
export const dynamic = "force-dynamic";

import { GuideTextSection } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function CheckoutInstructionsPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const d = dict?.listingEditor?.checkoutInstructions;
  return (
    <GuideTextSection
      title={nav?.checkoutInstructions ?? "Checkout instructions"}
      subtitle={d?.subtitle}
      guideKey="checkoutInstructions"
      placeholder={d?.instructionsPlaceholder}
      rows={7}
      maxLength={1500}
      saveLabel={nav?.save}
      savingLabel={nav?.saving}
    />
  );
}
