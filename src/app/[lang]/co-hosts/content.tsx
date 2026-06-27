"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import MenuPageHeader from "@/components/menu-pages/page-header";
import SiteFooter from "@/components/template/footer/site-footer";
import { useLocale } from "@/components/internationalization/use-locale";

const t = {
  en: {
    placeholder: "Search co-hosts near you",
    search: "Search",
    empty: "No co-hosts nearby",
    emptyDesc: "When new nearby co-hosts join, they'll show up here.",
  },
  ar: {
    placeholder: "ابحث عن مضيفين مشاركين بالقرب منك",
    search: "بحث",
    empty: "لا يوجد مضيفون مشاركون قريبون",
    emptyDesc: "عند انضمام مضيفين مشاركين جدد بالقرب منك، سيظهرون هنا.",
  },
} as const;

export default function CoHostsContent() {
  const { locale } = useLocale();
  const labels = t[locale] ?? t.en;
  const [query, setQuery] = useState("");

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <MenuPageHeader />

      <main className="flex-1">
        {/* Centered search pill — rounded-full, #dddddd border, soft shadow,
            32px coral search circle (matches airbnb.com/co-hosts/results). */}
        <div className="mx-auto w-full max-w-xl px-6 pt-10">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex items-center gap-2 rounded-full bg-white py-2 ps-6 pe-2 shadow-sm transition-shadow focus-within:shadow-md"
            style={{ border: "1px solid #dddddd" }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.placeholder}
              className="flex-1 bg-transparent text-sm text-[#222222] outline-none placeholder:text-gray-500"
            />
            <button
              type="submit"
              aria-label={labels.search}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#FF385C] text-white transition-colors hover:bg-[#E31C5F]"
            >
              <Search size={16} />
            </button>
          </form>
        </div>

        {/* Empty state — illustration + 22px/500 heading + muted subtext. */}
        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
          <div className="mb-8 flex h-40 w-40 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-50 to-amber-50">
            <span className="text-7xl" aria-hidden="true">
              🗺️
            </span>
          </div>
          <h2 className="text-2xl font-medium text-[#222222]">{labels.empty}</h2>
          <p className="mt-2 text-sm text-[#6a6a6a]">{labels.emptyDesc}</p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
