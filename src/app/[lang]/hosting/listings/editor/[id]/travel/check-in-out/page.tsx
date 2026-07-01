"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import { useEditorField } from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";

type Times = { checkIn: string; checkOut: string };

export default function CheckInOutPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const co = dict?.listingEditor?.checkInOut;
  const { value, setValue, dirty, saving, save } = useEditorField<Times>(
    (l) => ({ checkIn: l.checkInTime ?? "", checkOut: l.checkOutTime ?? "" }),
    { checkIn: "", checkOut: "" }
  );

  const checkInOpts = [
    { v: "14:00", l: co?.time1400 ?? "2:00 PM" },
    { v: "15:00", l: co?.time1500 ?? "3:00 PM" },
    { v: "16:00", l: co?.time1600 ?? "4:00 PM" },
    { v: "20:00", l: co?.time2000 ?? "8:00 PM" },
    { v: "21:00", l: co?.time2100 ?? "9:00 PM" },
    { v: "22:00", l: co?.time2200 ?? "10:00 PM" },
  ];
  const checkOutOpts = [
    { v: "10:00", l: co?.time1000 ?? "10:00 AM" },
    { v: "11:00", l: co?.time1100 ?? "11:00 AM" },
    { v: "12:00", l: co?.time1200 ?? "12:00 PM" },
  ];

  const selectCls =
    "w-full rounded-xl border border-input bg-background px-4 py-3.5 text-base outline-none transition focus:border-foreground";

  return (
    <EditorSection
      title={nav?.checkInOut ?? "Check-in and checkout"}
      subtitle={co?.subtitle ?? "Let guests know when they can arrive and when to leave."}
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block font-medium">{co?.checkInTitle ?? "Check-in"}</label>
          <select
            className={selectCls}
            value={value.checkIn}
            onChange={(e) => setValue({ ...value, checkIn: e.target.value })}
          >
            <option value="">—</option>
            {checkInOpts.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block font-medium">{co?.checkOutTitle ?? "Checkout"}</label>
          <select
            className={selectCls}
            value={value.checkOut}
            onChange={(e) => setValue({ ...value, checkOut: e.target.value })}
          >
            <option value="">—</option>
            {checkOutOpts.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ checkInTime: value.checkIn, checkOutTime: value.checkOut })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
