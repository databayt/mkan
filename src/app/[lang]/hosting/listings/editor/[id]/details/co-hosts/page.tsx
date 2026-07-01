"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { X } from "lucide-react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import { TextField } from "@/components/hosting/listing/editor-controls";
import { useGuideField } from "@/components/hosting/listing/editor-guide";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function CoHostsPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const ch = dict?.listingEditor?.coHosts;
  const { value, setValue, dirty, saving, saveField } = useGuideField<string[]>(
    "coHostInvites",
    []
  );
  const [email, setEmail] = React.useState("");

  const add = () => {
    const e = email.trim().toLowerCase();
    if (e && /.+@.+\..+/.test(e) && !value.includes(e)) {
      setValue([...value, e]);
      setEmail("");
    }
  };

  return (
    <EditorSection
      title={nav?.coHosts ?? "Co-hosts"}
      subtitle={ch?.subtitle ?? "Invite people you trust to help manage this listing."}
    >
      <h2 className="mb-3 text-lg font-semibold">{ch?.inviteTitle ?? "Invite a co-host"}</h2>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-2 block font-medium">{ch?.emailLabel ?? "Email"}</label>
          <TextField
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={ch?.emailPlaceholder ?? "name@example.com"}
          />
        </div>
        <button
          type="button"
          onClick={add}
          className="rounded-lg border border-foreground px-5 py-3.5 text-sm font-semibold transition hover:bg-muted"
        >
          {ch?.sendInvite ?? "Add"}
        </button>
      </div>
      {ch?.inviteHint ? (
        <p className="mt-2 text-sm text-muted-foreground">{ch.inviteHint}</p>
      ) : null}

      <h2 className="mb-3 mt-8 text-lg font-semibold">{ch?.listTitle ?? "Co-hosts"}</h2>
      {value.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="font-medium">{ch?.emptyTitle ?? "No co-hosts yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{ch?.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {value.map((e) => (
            <li
              key={e}
              className="flex items-center justify-between rounded-2xl border border-border p-4"
            >
              <div>
                <p className="font-medium">{e}</p>
                <p className="text-sm text-muted-foreground">{ch?.statusPending ?? "Pending"}</p>
              </div>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => setValue(value.filter((x) => x !== e))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

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
