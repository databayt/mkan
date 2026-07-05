"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useDictionary } from "@/components/internationalization/dictionary-context";

// Minimal legal footer on the mobile hosting surface (menu, Today):
// "Terms of Service · Privacy Policy" over the © line, centered, 12px.
export function HostingFooter({
  lang,
  className,
}: {
  lang: string;
  className?: string;
}) {
  const dict = useDictionary();
  const t = (
    dict.hosting as
      | { menuPage?: { terms?: string; privacy?: string; copyright?: string } }
      | undefined
  )?.menuPage;
  const year = new Date().getFullYear();

  return (
    <div className={cn("mt-8 text-center", className)}>
      <p className="text-xs text-[#222222]">
        <Link href={`/${lang}/terms`} className="underline">
          {t?.terms ?? "Terms of Service"}
        </Link>
        <span className="mx-1.5">·</span>
        <Link href={`/${lang}/privacy`} className="underline">
          {t?.privacy ?? "Privacy Policy"}
        </Link>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {(t?.copyright ?? "© {year} Mkan. All rights reserved.").replace(
          "{year}",
          String(year),
        )}
      </p>
    </div>
  );
}
