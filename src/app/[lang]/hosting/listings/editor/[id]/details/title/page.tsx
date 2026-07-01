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

const MAX = 50;

export default function TitlePage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const tt = dict?.listingEditor?.title;
  const { value, setValue, dirty, saving, save } = useEditorField(
    (l) => l.title ?? "",
    ""
  );

  return (
    <EditorSection
      title={nav?.title ?? "Title"}
      subtitle={
        tt?.subtitle ??
        "Short titles work best. Have fun with it — you can always change it later."
      }
    >
      <TextArea
        value={value}
        onChange={(v) => setValue(v.slice(0, MAX))}
        maxLength={MAX}
        rows={3}
        placeholder={tt?.placeholder ?? "Peaceful place to relax"}
      />
      <Counter value={value.length} max={MAX} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ title: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
