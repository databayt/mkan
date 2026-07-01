"use client";
export const dynamic = "force-dynamic";

import { GuideFieldsSection } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function WifiDetailsPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const d = dict?.listingEditor?.wifiDetails;
  return (
    <GuideFieldsSection
      title={nav?.wifiDetails ?? "Wifi details"}
      subtitle={d?.subtitle}
      fields={[
        {
          key: "wifiName",
          label: d?.networkName ?? "Network name",
          placeholder: d?.networkNamePlaceholder,
        },
        {
          key: "wifiPassword",
          label: d?.password ?? "Password",
          placeholder: d?.passwordPlaceholder,
        },
      ]}
      saveLabel={nav?.save}
      savingLabel={nav?.saving}
    />
  );
}
