"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { CheckInMethod } from "@prisma/client";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  OptionCard,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function CheckInMethodPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const cm = dict?.listingEditor?.checkInMethod;
  const { value, setValue, dirty, saving, save } = useEditorField(
    (l) => (l.checkInMethod as CheckInMethod | null) ?? null,
    null as CheckInMethod | null
  );

  const methods: { id: CheckInMethod; name?: string; hint?: string }[] = [
    { id: CheckInMethod.SmartLock, name: cm?.smartLock, hint: cm?.smartLockHint },
    { id: CheckInMethod.Lockbox, name: cm?.lockbox, hint: cm?.lockboxHint },
    { id: CheckInMethod.InPerson, name: cm?.inPerson, hint: cm?.inPersonHint },
    { id: CheckInMethod.SelfCheckIn, name: cm?.selfCheckIn, hint: cm?.selfCheckInHint },
  ];

  return (
    <EditorSection
      title={nav?.checkInMethod ?? "Check-in method"}
      subtitle={cm?.subtitle ?? "How will guests get into your place?"}
    >
      <div className="space-y-3">
        {methods.map((m) => (
          <OptionCard
            key={m.id}
            selected={value === m.id}
            onClick={() => setValue(m.id)}
            title={m.name ?? m.id}
            description={m.hint}
          />
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ checkInMethod: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
