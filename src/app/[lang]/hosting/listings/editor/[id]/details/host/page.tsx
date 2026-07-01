"use client";
export const dynamic = "force-dynamic";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EditorSection } from "@/components/hosting/listing/editor-section";
import { useEditor } from "@/components/hosting/listing/editor-context";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function HostPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const h = dict?.listingEditor?.host;
  const { listing } = useEditor();
  const params = useParams<{ lang: string }>();
  const lang = params?.lang ?? "en";
  const name = listing?.host?.username || listing?.host?.email || "—";
  const initial = (name?.[0] ?? "?").toUpperCase();

  return (
    <EditorSection
      title={nav?.host ?? "Host"}
      subtitle={h?.subtitle ?? "Your host profile is shown to guests on every listing."}
    >
      <div className="flex items-center gap-4 rounded-2xl border border-border p-6">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-xl font-semibold text-background">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-muted-foreground">{h?.aboutYou ?? "About you"}</p>
        </div>
        <Link
          href={`/${lang}/profile/about?editMode=true`}
          className="inline-flex shrink-0 items-center rounded-lg border border-foreground px-4 py-2.5 text-sm font-semibold transition hover:bg-muted"
        >
          {lang === "ar" ? "تعديل الملف الشخصي" : "Edit profile"}
        </Link>
      </div>
    </EditorSection>
  );
}
