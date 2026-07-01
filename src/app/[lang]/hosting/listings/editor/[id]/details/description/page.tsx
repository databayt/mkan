"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  TextArea,
  Counter,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const MAX = 500;

export default function DescriptionPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const dd = dict?.listingEditor?.description;
  const { value, setValue, dirty, saving, save } = useEditorField(
    (l) => l.description ?? "",
    ""
  );

  return (
    <EditorSection
      title={nav?.description ?? "Description"}
      subtitle={
        dd?.subtitle ??
        "Share what makes your place special and what guests can expect."
      }
    >
      <TextArea
        value={value}
        onChange={(v) => setValue(v.slice(0, MAX))}
        maxLength={MAX}
        rows={9}
        placeholder={dd?.placeholder ?? "You'll have a great time at this comfortable place to stay."}
      />
      <Counter value={value.length} max={MAX} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ description: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
