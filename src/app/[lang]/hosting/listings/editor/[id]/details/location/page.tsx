"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  TextField,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

type Addr = {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export default function LocationPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const lo = dict?.listingEditor?.location;
  const { value, setValue, dirty, saving, save } = useEditorField<Addr>(
    (l) => ({
      address: l.location?.address ?? "",
      city: l.location?.city ?? "",
      state: l.location?.state ?? "",
      country: l.location?.country ?? "",
      postalCode: l.location?.postalCode ?? "",
    }),
    { address: "", city: "", state: "", country: "", postalCode: "" }
  );

  const set = (k: keyof Addr) => (v: string) => setValue({ ...value, [k]: v });

  const field = (
    k: keyof Addr,
    label?: string,
    placeholder?: string,
    full = false
  ) => (
    <div className={full ? "sm:col-span-2" : undefined}>
      <label className="mb-2 block font-medium">{label}</label>
      <TextField value={value[k]} onChange={set(k)} placeholder={placeholder} />
    </div>
  );

  return (
    <EditorSection
      title={nav?.location ?? "Location"}
      subtitle={lo?.subtitle ?? "Your address is only shared with guests after they book."}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {field("address", lo?.streetAddress, lo?.streetAddressPlaceholder, true)}
        {field("city", lo?.city, lo?.cityPlaceholder)}
        {field("state", lo?.state, lo?.statePlaceholder)}
        {field("country", lo?.country, lo?.countryPlaceholder)}
        {field("postalCode", lo?.postalCode, lo?.postalCodePlaceholder)}
      </div>

      {lo?.privacyText ? (
        <div className="mt-6 rounded-2xl border border-border p-5">
          <p className="font-medium">{lo?.privacyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{lo.privacyText}</p>
        </div>
      ) : null}

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save(value)}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
