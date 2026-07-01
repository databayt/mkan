"use client";
export const dynamic = "force-dynamic";

import React from "react";
import { useParams } from "next/navigation";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import {
  useEditorField,
  TextField,
} from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { formatCurrency } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";

type PriceForm = {
  price: number;
  cleaning: number;
  weekly: number;
  monthly: number;
};

export default function PricingPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const pp = dict?.listingEditor?.pricing;
  const params = useParams<{ lang: string }>();
  const lang = (params?.lang ?? "en") as Locale;
  const currency = lang === "ar" ? "ج.س" : "SDG";

  const { value, setValue, dirty, saving, save } = useEditorField<PriceForm>(
    (l) => ({
      price: l.pricePerNight ?? 0,
      cleaning: l.cleaningFee ?? 0,
      weekly: l.weeklyDiscount ?? 0,
      monthly: l.monthlyDiscount ?? 0,
    }),
    { price: 0, cleaning: 0, weekly: 0, monthly: 0 }
  );

  const set = (k: keyof PriceForm) => (v: string) =>
    setValue({ ...value, [k]: Number(v) || 0 });

  const onSave = () =>
    save({
      pricePerNight: value.price,
      cleaningFee: value.cleaning,
      weeklyDiscount: value.weekly,
      monthlyDiscount: value.monthly,
    });

  // Estimated guest price preview (base + cleaning).
  const guestTotal = value.price + value.cleaning;

  return (
    <EditorSection
      title={nav?.pricing ?? "Pricing"}
      subtitle={pp?.subtitle ?? "Set a base price and adjust fees and discounts."}
    >
      <div className="space-y-6">
        <div>
          <label className="mb-2 block font-medium">
            {pp?.label ?? "Per-night price"}
          </label>
          <TextField
            type="number"
            value={String(value.price)}
            onChange={set("price")}
            prefix={currency}
            placeholder="0"
          />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <label className="mb-2 block font-medium">{pp?.cleaningFee ?? "Cleaning fee"}</label>
            <TextField type="number" value={String(value.cleaning)} onChange={set("cleaning")} prefix={currency} placeholder="0" />
          </div>
          <div>
            <label className="mb-2 block font-medium">{pp?.weeklyDiscount ?? "Weekly discount"}</label>
            <TextField type="number" value={String(value.weekly)} onChange={set("weekly")} prefix="%" placeholder="0" />
          </div>
          <div>
            <label className="mb-2 block font-medium">{pp?.monthlyDiscount ?? "Monthly discount"}</label>
            <TextField type="number" value={String(value.monthly)} onChange={set("monthly")} prefix="%" placeholder="0" />
          </div>
        </div>

        {/* Guest price preview */}
        <div className="rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{pp?.label ?? "Per-night price"}</span>
            <span>{formatCurrency(value.price, lang)}</span>
          </div>
          {value.cleaning > 0 ? (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{pp?.cleaningFee ?? "Cleaning fee"}</span>
              <span>{formatCurrency(value.cleaning, lang)}</span>
            </div>
          ) : null}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-semibold">
            <span>{pp?.total ?? "Guest price before taxes"}</span>
            <span>{formatCurrency(guestTotal, lang)}</span>
          </div>
        </div>
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
