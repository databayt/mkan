"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import { ToggleRow, TextArea } from "@/components/hosting/listing/editor-controls";
import { useGuide } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const DEVICE_IDS = ["smokeAlarm", "carbonMonoxide", "fireExtinguisher", "firstAid", "securityCamera"] as const;

export default function GuestSafetyPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const gs = dict?.listingEditor?.guestSafety;
  const devices = (gs?.devices ?? {}) as Record<string, string>;

  const { guide, saveGuide, saving } = useGuide();
  const serverSafety = ((guide.safety as Record<string, boolean>) ?? {}) as Record<string, boolean>;
  const serverNotes = (guide.safetyNotes as string) ?? "";
  const serialized = JSON.stringify({ s: serverSafety, n: serverNotes });

  const [safety, setSafety] = React.useState<Record<string, boolean>>(serverSafety);
  const [notes, setNotes] = React.useState<string>(serverNotes);

  React.useEffect(() => {
    const { s, n } = JSON.parse(serialized);
    setSafety(s);
    setNotes(n);
  }, [serialized]);

  const dirty = JSON.stringify({ s: safety, n: notes }) !== serialized;

  return (
    <EditorSection
      title={nav?.guestSafety ?? "Guest safety"}
      subtitle={gs?.subtitle ?? "Let guests know which safety devices are in place."}
    >
      <h2 className="mb-2 text-lg font-semibold">{gs?.devicesTitle ?? "Safety devices"}</h2>
      <div className="rounded-2xl border border-border px-6">
        {DEVICE_IDS.map((id) => (
          <ToggleRow
            key={id}
            label={devices[id] ?? id}
            description={devices[`${id}Desc`]}
            checked={!!safety[id]}
            onChange={(v) => setSafety({ ...safety, [id]: v })}
          />
        ))}
      </div>

      <div className="mt-6">
        <label className="mb-2 block font-medium">{gs?.additionalTitle ?? "Additional safety details"}</label>
        <TextArea
          value={notes}
          onChange={(v) => setNotes(v.slice(0, 1000))}
          maxLength={1000}
          rows={4}
          placeholder={gs?.additionalPlaceholder}
        />
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => saveGuide({ safety, safetyNotes: notes })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
