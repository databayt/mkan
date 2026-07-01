"use client";
export const dynamic = "force-dynamic";

import { GuideTextSection } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function HouseManualPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const d = dict?.listingEditor?.houseManual;
  return (
    <GuideTextSection
      title={nav?.houseManual ?? "House manual"}
      subtitle={d?.subtitle}
      guideKey="houseManual"
      placeholder={d?.notesPlaceholder}
      rows={8}
      maxLength={2000}
      saveLabel={nav?.save}
      savingLabel={nav?.saving}
    />
  );
}
