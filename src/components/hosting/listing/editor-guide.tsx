"use client";

/**
 * Helpers for the free-text "arrival guide" + misc sections that have no
 * dedicated DB column. They all persist into the single `guideInfo` JSON bag
 * on the listing, merged key-by-key.
 */

import React from "react";
import { EditorSection, SaveBar } from "./editor-section";
import { TextArea, Counter, TextField } from "./editor-controls";
import { useEditor } from "./editor-context";

type GuideBag = Record<string, unknown>;

export function useGuide() {
  const { listing, save, saving } = useEditor();
  const guide = ((listing?.guideInfo as GuideBag | null) ?? {}) as GuideBag;
  const saveGuide = (patch: GuideBag) => save({ guideInfo: { ...guide, ...patch } });
  return { guide, saveGuide, saving };
}

export function useGuideField<T>(key: string, fallback: T) {
  const { guide, saveGuide, saving } = useGuide();
  const server = (guide[key] as T | undefined) ?? fallback;
  const serialized = JSON.stringify(server);
  const [value, setValue] = React.useState<T>(server);

  React.useEffect(() => {
    setValue(JSON.parse(serialized) as T);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const dirty = JSON.stringify(value) !== serialized;
  const saveField = () => saveGuide({ [key]: value });
  return { value, setValue, dirty, saving, saveField };
}

/** A complete free-text section backed by one guideInfo key. */
export function GuideTextSection({
  title,
  subtitle,
  guideKey,
  placeholder,
  rows = 6,
  maxLength = 1000,
  saveLabel,
  savingLabel,
}: {
  title: string;
  subtitle?: string;
  guideKey: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  saveLabel?: string;
  savingLabel?: string;
}) {
  const { value, setValue, dirty, saving, saveField } = useGuideField<string>(
    guideKey,
    ""
  );
  return (
    <EditorSection title={title} subtitle={subtitle}>
      <TextArea
        value={value}
        onChange={(v) => setValue(v.slice(0, maxLength))}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
      />
      <Counter value={value.length} max={maxLength} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={saveField}
        saveLabel={saveLabel}
        savingLabel={savingLabel}
      />
    </EditorSection>
  );
}

/** A section backed by several guideInfo keys (e.g. wifi name + password). */
export function GuideFieldsSection({
  title,
  subtitle,
  fields,
  saveLabel,
  savingLabel,
}: {
  title: string;
  subtitle?: string;
  fields: { key: string; label: string; placeholder?: string; type?: string }[];
  saveLabel?: string;
  savingLabel?: string;
}) {
  const { guide, saveGuide, saving } = useGuide();
  const server: Record<string, string> = {};
  for (const f of fields) server[f.key] = (guide[f.key] as string) ?? "";
  const serialized = JSON.stringify(server);
  const [value, setValue] = React.useState<Record<string, string>>(server);

  React.useEffect(() => {
    setValue(JSON.parse(serialized));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const dirty = JSON.stringify(value) !== serialized;

  return (
    <EditorSection title={title} subtitle={subtitle}>
      <div className="space-y-6">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-2 block font-medium">{f.label}</label>
            <TextField
              type={f.type}
              value={value[f.key] ?? ""}
              onChange={(v) => setValue({ ...value, [f.key]: v })}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => saveGuide(value)}
        saveLabel={saveLabel}
        savingLabel={savingLabel}
      />
    </EditorSection>
  );
}
