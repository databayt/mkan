"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  Stepper,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

type Capacity = { guests: number; bedrooms: number; bathrooms: number };

export default function NumberOfGuestsPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const ng = dict?.listingEditor?.numberOfGuests;
  const { value, setValue, dirty, saving, save } = useEditorField<Capacity>(
    (l) => ({
      guests: l.guestCount ?? 1,
      bedrooms: l.bedrooms ?? 1,
      bathrooms: l.bathrooms ?? 1,
    }),
    { guests: 1, bedrooms: 1, bathrooms: 1 }
  );

  const onSave = () =>
    save({
      guestCount: value.guests,
      bedrooms: value.bedrooms,
      bathrooms: value.bathrooms,
    });

  return (
    <EditorSection
      title={nav?.numberOfGuests ?? "Number of guests"}
      subtitle={ng?.subtitle ?? "Set how many guests your place can accommodate."}
    >
      <div className="rounded-2xl border border-border px-6">
        <Stepper
          label={ng?.guests ?? "Guests"}
          hint={ng?.guestsHint ?? "Max overnight guests including children"}
          value={value.guests}
          onChange={(n) => setValue({ ...value, guests: n })}
          min={1}
          max={50}
        />
        <Stepper
          label={ng?.bedrooms ?? "Bedrooms"}
          hint={ng?.bedroomsHint ?? "Separate sleeping rooms"}
          value={value.bedrooms}
          onChange={(n) => setValue({ ...value, bedrooms: n })}
          min={0}
          max={50}
        />
        <Stepper
          label={ng?.bathrooms ?? "Bathrooms"}
          hint={ng?.bathroomsHint ?? "Full or shared bathrooms"}
          value={value.bathrooms}
          onChange={(n) => setValue({ ...value, bathrooms: n })}
          min={0}
          max={50}
        />
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={onSave}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
