"use client";
import { cdn } from "@/lib/cdn";

import { useState } from "react";
import Image from "next/image";
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
        {/* Search pill — exact clone of airbnb.com/co-hosts: fixed 50px height,
            100px radius, #dddddd hairline, white, soft two-layer shadow, the
            32px coral search circle centred on the right. (measured live) */}
        <div className="mx-auto w-full px-6 pt-7" style={{ maxWidth: 573 + 48 }}>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="mx-auto flex items-center transition-shadow"
            style={{
              width: "100%",
              maxWidth: 573,
              height: 50,
              boxSizing: "border-box",
              padding: "15px 20px",
              border: "1px solid #dddddd",
              borderRadius: 100,
              background: "#ffffff",
              boxShadow:
                "rgba(0, 0, 0, 0.08) 0px 1px 2px 0px, rgba(0, 0, 0, 0.05) 0px 4px 12px 0px",
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.placeholder}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[#757575]"
              style={{
                height: 18,
                marginInlineEnd: 8,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: "18px",
                color: "#222222",
              }}
            />
            <button
              type="submit"
              aria-label={labels.search}
              className="flex flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-[#E31C5F]"
              style={{ width: 32, height: 32, background: "#FF385C" }}
            >
              {/* Original Airbnb search magnifier (captured icon-1.svg) — bolder
                  stroke than lucide's. viewBox 32, stroke-width 5.333 = exact. */}
              <svg
                viewBox="0 0 32 32"
                role="presentation"
                focusable="false"
                aria-hidden="true"
                style={{
                  display: "block",
                  width: 16,
                  height: 16,
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: 5.33333,
                  overflow: "visible",
                }}
              >
                <path d="m20.666 20.666 10 10" />
                <path
                  d="m24.0002 12.6668c0 6.2593-5.0741 11.3334-11.3334 11.3334-6.2592 0-11.3333-5.0741-11.3333-11.3334 0-6.2592 5.0741-11.3333 11.3333-11.3333 6.2593 0 11.3334 5.0741 11.3334 11.3333z"
                  fill="none"
                />
              </svg>
            </button>
          </form>
        </div>

        {/* Empty state — real Airbnb isometric map/car/pin illustration
            (240×216, 16px radius, object-cover) then 22px/500 heading + 14px
            subtitle, both #222222. Gaps measured live: 68 / 24 / 8. */}
        <div
          className="mx-auto flex max-w-md flex-col items-center px-6 text-center"
          style={{ marginTop: 68 }}
        >
          <div
            className="relative overflow-hidden"
            style={{ width: 240, height: 216, borderRadius: 16 }}
          >
            <Image
              src={cdn.product("co-hosts/find-a-cohost.png")}
              alt=""
              fill
              sizes="240px"
              className="object-cover"
              aria-hidden="true"
            />
          </div>
          <h2
            style={{
              marginTop: 24,
              fontSize: 22,
              fontWeight: 500,
              lineHeight: "26px",
              letterSpacing: "-0.44px",
              color: "#222222",
            }}
          >
            {labels.empty}
          </h2>
          <p
            style={{
              marginTop: 8,
              fontSize: 14,
              fontWeight: 400,
              lineHeight: "18px",
              color: "#222222",
            }}
          >
            {labels.emptyDesc}
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
