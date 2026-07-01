"use client";

import React from "react";
import { EditorSection, SaveBar } from "./editor-section";
import { useEditorField, ToggleRow, TextArea } from "./editor-controls";

type HR = {
  petsAllowed: boolean;
  eventsAllowed: boolean;
  smokingAllowed: boolean;
  quietHoursEnabled: boolean;
  additionalRules: string;
};

export interface HouseRulesLabels {
  title: string;
  subtitle?: string;
  pets?: string;
  petsDesc?: string;
  smoking?: string;
  smokingDesc?: string;
  parties?: string;
  partiesDesc?: string;
  quietHours?: string;
  quietHoursDesc?: string;
  additionalTitle?: string;
  additionalPlaceholder?: string;
  saveLabel?: string;
  savingLabel?: string;
}

/** Shared editor for the `houseRules` JSON column (used by details + arrival guide). */
export function HouseRulesEditor({ labels }: { labels: HouseRulesLabels }) {
  const { value, setValue, dirty, saving, save } = useEditorField<HR>(
    (l) => {
      const r = (l.houseRules as Partial<HR> | null) ?? {};
      return {
        petsAllowed: !!r.petsAllowed,
        eventsAllowed: !!r.eventsAllowed,
        smokingAllowed: !!r.smokingAllowed,
        quietHoursEnabled: !!r.quietHoursEnabled,
        additionalRules: r.additionalRules ?? "",
      };
    },
    {
      petsAllowed: false,
      eventsAllowed: false,
      smokingAllowed: false,
      quietHoursEnabled: false,
      additionalRules: "",
    }
  );

  return (
    <EditorSection title={labels.title} subtitle={labels.subtitle}>
      <div className="rounded-2xl border border-border px-6">
        <ToggleRow
          label={labels.pets ?? "Pets allowed"}
          description={labels.petsDesc}
          checked={value.petsAllowed}
          onChange={(v) => setValue({ ...value, petsAllowed: v })}
        />
        <ToggleRow
          label={labels.parties ?? "Events allowed"}
          description={labels.partiesDesc}
          checked={value.eventsAllowed}
          onChange={(v) => setValue({ ...value, eventsAllowed: v })}
        />
        <ToggleRow
          label={labels.smoking ?? "Smoking allowed"}
          description={labels.smokingDesc}
          checked={value.smokingAllowed}
          onChange={(v) => setValue({ ...value, smokingAllowed: v })}
        />
        <ToggleRow
          label={labels.quietHours ?? "Quiet hours"}
          description={labels.quietHoursDesc}
          checked={value.quietHoursEnabled}
          onChange={(v) => setValue({ ...value, quietHoursEnabled: v })}
        />
      </div>

      <div className="mt-6">
        <label className="mb-2 block font-medium">
          {labels.additionalTitle ?? "Additional rules"}
        </label>
        <TextArea
          value={value.additionalRules}
          onChange={(v) => setValue({ ...value, additionalRules: v.slice(0, 1000) })}
          maxLength={1000}
          rows={5}
          placeholder={labels.additionalPlaceholder}
        />
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ houseRules: value })}
        saveLabel={labels.saveLabel}
        savingLabel={labels.savingLabel}
      />
    </EditorSection>
  );
}
