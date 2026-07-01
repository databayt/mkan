"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  Stepper,
  TextField,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

type Avail = {
  minNights: number;
  maxNights: number;
  advanceNotice: number;
  preparationTime: number;
  availabilityWindow: number;
};

export default function AvailabilityPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const av = dict?.listingEditor?.availability;
  const { value, setValue, dirty, saving, save } = useEditorField<Avail>(
    (l) => ({
      minNights: l.minStay ?? 1,
      maxNights: l.maxStay ?? 365,
      advanceNotice: l.advanceNotice ?? 1,
      preparationTime: l.preparationTime ?? 0,
      availabilityWindow: l.availabilityWindow ?? 12,
    }),
    { minNights: 1, maxNights: 365, advanceNotice: 1, preparationTime: 0, availabilityWindow: 12 }
  );

  const numField = (k: keyof Avail, label?: string, hint?: string, unit?: string) => (
    <div>
      <label className="mb-2 block font-medium">{label}</label>
      <TextField
        type="number"
        value={String(value[k])}
        onChange={(v) => setValue({ ...value, [k]: Number(v) || 0 })}
        prefix={unit}
      />
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <EditorSection
      title={nav?.availability ?? "Availability"}
      subtitle={av?.subtitle ?? "Set trip lengths and how far in advance guests can book."}
    >
      <div className="space-y-8">
        <div>
          <h2 className="mb-3 text-lg font-semibold">{av?.tripLengthTitle ?? "Trip length"}</h2>
          <div className="rounded-2xl border border-border px-6">
            <Stepper
              label={av?.minNights ?? "Minimum nights"}
              hint={av?.minNightsHint}
              value={value.minNights}
              onChange={(n) => setValue({ ...value, minNights: n })}
              min={1}
              max={365}
            />
            <Stepper
              label={av?.maxNights ?? "Maximum nights"}
              hint={av?.maxNightsHint}
              value={value.maxNights}
              onChange={(n) => setValue({ ...value, maxNights: n })}
              min={1}
              max={365}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">{av?.bookingSettingsTitle ?? "Booking window"}</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {numField("advanceNotice", av?.advanceNotice, av?.advanceNoticeHint)}
            {numField("preparationTime", av?.preparationTime, av?.preparationTimeHint)}
            {numField("availabilityWindow", av?.availabilityWindow, av?.availabilityWindowHint)}
          </div>
        </div>
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() =>
          save({
            minStay: value.minNights,
            maxStay: value.maxNights,
            advanceNotice: value.advanceNotice,
            preparationTime: value.preparationTime,
            availabilityWindow: value.availabilityWindow,
          })
        }
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
