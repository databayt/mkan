"use client";
export const dynamic = "force-dynamic";

import { HouseRulesEditor } from "@/components/hosting/listing/house-rules-editor";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function HouseRulesPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const hr = dict?.listingEditor?.houseRules;
  return (
    <HouseRulesEditor
      labels={{
        title: nav?.houseRules ?? "House rules",
        subtitle: hr?.subtitle,
        pets: hr?.petsAllowed,
        petsDesc: hr?.petsAllowedDesc,
        smoking: hr?.smokingAllowed,
        smokingDesc: hr?.smokingAllowedDesc,
        parties: hr?.partiesAllowed,
        partiesDesc: hr?.partiesAllowedDesc,
        quietHours: hr?.quietHours,
        quietHoursDesc: hr?.quietHoursDesc,
        additionalTitle: hr?.additionalRulesTitle,
        additionalPlaceholder: hr?.additionalRulesPlaceholder,
        saveLabel: nav?.save,
        savingLabel: nav?.saving,
      }}
    />
  );
}
