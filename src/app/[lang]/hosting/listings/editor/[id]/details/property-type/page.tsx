"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  OptionCard,
} from "@/components/hosting/listing/editor-controls";
import { PROPERTY_TYPE_OPTIONS } from "@/components/host/constants";
import { PropertyTypeIcon } from "@/components/host/property-type-icons";
import { useDictionary } from "@/components/internationalization/dictionary-context";

// The authentic Airbnb icons use a Framer mount animation; gating to
// client-mount avoids an SSR/hydration mismatch (and gives the draw-in effect).
function ClientIcon({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <span className="block size-7" />;
}

export default function PropertyTypePage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const pt = dict?.listingEditor?.propertyType;
  const { value, setValue, dirty, saving, save } = useEditorField(
    (l) => (l.propertyType as string | null) ?? "",
    ""
  );

  return (
    <EditorSection
      title={nav?.propertyType ?? "Property type"}
      subtitle={pt?.subtitle ?? "What type of place will guests have?"}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROPERTY_TYPE_OPTIONS.map((opt, i) => (
          <OptionCard
            key={opt.id}
            selected={value === opt.id}
            onClick={() => setValue(opt.id)}
            title={opt.title}
            description={opt.description}
            icon={
              <ClientIcon>
                <PropertyTypeIcon type={String(opt.id).toLowerCase()} size={28} index={i} />
              </ClientIcon>
            }
          />
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ propertyType: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
