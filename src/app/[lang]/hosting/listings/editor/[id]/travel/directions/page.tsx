"use client";
export const dynamic = "force-dynamic";

import { GuideTextSection } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function DirectionsPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const d = dict?.listingEditor?.directions;
  return (
    <GuideTextSection
      title={nav?.directions ?? "Directions"}
      subtitle={d?.subtitle}
      guideKey="directions"
      placeholder={d?.fromLandmarkPlaceholder}
      saveLabel={nav?.save}
      savingLabel={nav?.saving}
    />
  );
}
