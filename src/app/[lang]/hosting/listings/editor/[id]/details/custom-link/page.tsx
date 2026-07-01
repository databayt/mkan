"use client";
export const dynamic = "force-dynamic";

import { GuideFieldsSection } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function CustomLinkPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const d = dict?.listingEditor?.customLink;
  return (
    <GuideFieldsSection
      title={nav?.customLink ?? "Custom link"}
      subtitle={d?.subtitle}
      fields={[
        {
          key: "customLink",
          label: d?.slugLabel ?? "Custom link",
          placeholder: d?.slugPlaceholder ?? "your-place",
        },
      ]}
      saveLabel={nav?.save}
      savingLabel={nav?.saving}
    />
  );
}
