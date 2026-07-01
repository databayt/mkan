"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import { OptionCard } from "@/components/hosting/listing/editor-controls";
import { useGuide } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function InteractionPreferencesPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const ip = dict?.listingEditor?.interactionPreferences;

  const { guide, saveGuide, saving } = useGuide();
  const serverStyle = (guide.interactionStyle as string) ?? "";
  const serverResp = (guide.responseTime as string) ?? "";
  const serialized = JSON.stringify({ s: serverStyle, r: serverResp });

  const [style, setStyle] = React.useState(serverStyle);
  const [resp, setResp] = React.useState(serverResp);

  React.useEffect(() => {
    const { s, r } = JSON.parse(serialized);
    setStyle(s);
    setResp(r);
  }, [serialized]);

  const dirty = JSON.stringify({ s: style, r: resp }) !== serialized;

  const styles = [
    { id: "alwaysAvailable", name: ip?.alwaysAvailable, hint: ip?.alwaysAvailableHint },
    { id: "onRequest", name: ip?.onRequest, hint: ip?.onRequestHint },
    { id: "minimalContact", name: ip?.minimalContact, hint: ip?.minimalContactHint },
  ];
  const responses = [
    { id: "withinHour", name: ip?.withinHour },
    { id: "withinFewHours", name: ip?.withinFewHours },
    { id: "withinDay", name: ip?.withinDay },
  ];

  return (
    <EditorSection
      title={nav?.interactionPreferences ?? "Interaction preferences"}
      subtitle={ip?.subtitle ?? "Tell guests how involved you like to be during their stay."}
    >
      <h2 className="mb-3 text-lg font-semibold">{ip?.styleTitle ?? "Your style"}</h2>
      <div className="space-y-3">
        {styles.map((s) => (
          <OptionCard
            key={s.id}
            selected={style === s.id}
            onClick={() => setStyle(s.id)}
            title={s.name ?? s.id}
            description={s.hint}
          />
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{ip?.responseTimeTitle ?? "Response time"}</h2>
      <div className="space-y-3">
        {responses.map((r) => (
          <OptionCard
            key={r.id}
            selected={resp === r.id}
            onClick={() => setResp(r.id)}
            title={r.name ?? r.id}
          />
        ))}
      </div>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => saveGuide({ interactionStyle: style, responseTime: resp })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
