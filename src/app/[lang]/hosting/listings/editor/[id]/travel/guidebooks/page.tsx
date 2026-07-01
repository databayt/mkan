"use client";
export const dynamic = "force-dynamic";

import { GuideTextSection } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function GuidebooksPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const d = dict?.listingEditor?.guidebooks;
  return (
    <GuideTextSection
      title={nav?.guidebooks ?? "Guidebooks"}
      subtitle={d?.subtitle}
      guideKey="guidebooks"
      placeholder={d?.note}
      rows={8}
      maxLength={2000}
      saveLabel={nav?.save}
      savingLabel={nav?.saving}
    />
  );
}
