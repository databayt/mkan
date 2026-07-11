"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { Check } from "lucide-react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import { useGuideField } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { cn } from "@/lib/utils";

const FEATURE_IDS = [
  "stepFreeEntrance",
  "wideDoorway",
  "accessibleBathroom",
  "stepFreeBedroom",
  "grabBars",
  "showerChair",
  "accessibleParking",
  "elevator",
] as const;

export default function AccessibilityPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const ac = dict?.listingEditor?.accessibility;
  const feats = (ac?.features ?? {}) as Record<string, string>;
  const { value, setValue, dirty, saving, saveField } = useGuideField<string[]>(
    "accessibility",
    []
  );

  const toggle = (id: string) =>
    setValue(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <EditorSection
      title={nav?.accessibility ?? "Accessibility features"}
      subtitle={ac?.subtitle ?? "Add accessibility features so guests know what to expect."}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURE_IDS.map((id) => {
          const selected = value.includes(id);
          const desc = feats[`${id}Desc`];
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              data-selected={selected}
              className={cn(
                "relative rounded-2xl border border-border p-4 pe-10 text-start transition hover:border-foreground",
                "data-[selected=true]:border-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-foreground"
              )}
            >
              <p className="font-medium">{feats[id] ?? id}</p>
              {desc ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
              ) : null}
              {selected ? (
                <span className="absolute end-3 top-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={saveField}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
