"use client";
export const dynamic = "force-dynamic";

import { HouseRulesEditor } from "@/components/hosting/listing/house-rules-editor";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function TravelHouseRulesPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const hr = dict?.listingEditor?.travelHouseRules;
  return (
    <HouseRulesEditor
      labels={{
        title: nav?.travelHouseRules ?? "House rules",
        subtitle: hr?.subtitle,
        pets: hr?.pets,
        petsDesc: hr?.petsHint,
        smoking: hr?.smoking,
        smokingDesc: hr?.smokingHint,
        parties: hr?.parties,
        partiesDesc: hr?.partiesHint,
        quietHours: hr?.quietHours,
        quietHoursDesc: hr?.quietHoursHint,
        additionalTitle: hr?.customLabel,
        additionalPlaceholder: hr?.customPlaceholder,
        saveLabel: nav?.save,
        savingLabel: nav?.saving,
      }}
    />
  );
}
