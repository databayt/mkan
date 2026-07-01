"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  ToggleRow,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function InstantBookPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const ib = dict?.listingEditor?.instantBook;
  const { value, setValue, dirty, saving, save } = useEditorField(
    (l) => Boolean(l.instantBook),
    false
  );

  return (
    <EditorSection
      title={nav?.instantBook ?? "Instant Book"}
      subtitle={
        ib?.subtitle ??
        "Choose how guests can book. Instant Book lets them reserve automatically."
      }
    >
      <div className="rounded-2xl border border-border px-6">
        <ToggleRow
          label={nav?.instantBook ?? "Instant Book"}
          description={
            ib?.toggleDescription ??
            "Guests can book automatically without requesting approval."
          }
          checked={value}
          onChange={setValue}
        />
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ instantBook: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
