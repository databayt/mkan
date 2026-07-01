"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { CancellationPolicy } from "@prisma/client";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  OptionCard,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function CancellationPolicyPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const cp = dict?.listingEditor?.cancellationPolicy;
  const { value, setValue, dirty, saving, save } = useEditorField(
    (l) => (l.cancellationPolicy as CancellationPolicy | null) ?? CancellationPolicy.Flexible,
    CancellationPolicy.Flexible
  );

  const policies: { id: CancellationPolicy; name?: string; desc?: string }[] = [
    { id: CancellationPolicy.Flexible, name: cp?.flexibleName, desc: cp?.flexibleDesc },
    { id: CancellationPolicy.Moderate, name: cp?.moderateName, desc: cp?.moderateDesc },
    { id: CancellationPolicy.Firm, name: cp?.firmName, desc: cp?.firmDesc },
    { id: CancellationPolicy.Strict, name: cp?.strictName, desc: cp?.strictDesc },
    { id: CancellationPolicy.NonRefundable, name: cp?.nonRefundableName, desc: cp?.nonRefundableDesc },
  ];

  return (
    <EditorSection
      title={nav?.cancellationPolicy ?? "Cancellation policy"}
      subtitle={cp?.subtitle ?? "Choose how flexible your cancellation terms are."}
    >
      <div className="space-y-3">
        {policies.map((p) => (
          <OptionCard
            key={p.id}
            selected={value === p.id}
            onClick={() => setValue(p.id)}
            title={p.name ?? p.id}
            description={p.desc}
          />
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ cancellationPolicy: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
