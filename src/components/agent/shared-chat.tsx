import Link from "next/link";
import { MessageCircle, SquarePen } from "lucide-react";

import { BlurImage } from "@/components/atom/blur-image";
import type { Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";

import { ChatHeader, headerButton } from "./header";
import type { AgentTaskView, ShortlistItem } from "./types";
import { MKAN_WA_NUMBER } from "./wa-link";

type Labels = Record<string, string | undefined>;

/**
 * A chat opened from a WhatsApp link (chat-link.ts): the homes the agent found, with photos and what
 * moving in costs — what the link promises — read-only. The conversation itself goes on in WhatsApp;
 * a new search starts a chat of this browser's own (2026-11-06: the link used to open an empty chat).
 */
export async function SharedChat({ task, lang }: { task: AgentTaskView; lang: Locale }) {
  const dict = await getDictionary(lang);
  const agent = (dict as unknown as { agent?: { chat?: Labels; card?: Labels; shared?: Labels } }).agent;
  const sh = agent?.shared ?? {};
  const card = agent?.card ?? {};
  const homes = task.shortlist.slice(0, 12);
  const zoneLang = lang === "ar" || lang === "rw" ? lang : "en";
  const place = (h: ShortlistItem) => zoneLabel(h.zone, zoneLang) ?? (h.district ? districtName(h.district.toUpperCase(), zoneLang) || h.district : null);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ChatHeader
        title={agent?.chat?.name ?? "Mkan"}
        scrolled={false}
        end={
          <Link href={`/${lang}/find`} aria-label={sh.newSearch ?? "New search"} title={sh.newSearch ?? "New search"} className={headerButton}>
            <SquarePen aria-hidden />
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-4">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">{sh.title ?? "The homes from your WhatsApp chat"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{sh.intro ?? "Photos and what moving in costs. Reply on WhatsApp with a home's number and Mkan checks it with the broker."}</p>
        {homes.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">{sh.empty ?? "No homes in this chat yet. Tell Mkan on WhatsApp what you are looking for."}</p>
        ) : (
          <ol className="mt-5 grid list-none grid-cols-1 gap-5 sm:grid-cols-2">
            {homes.map((h, i) => (
              <li key={h.id}>
                <Link href={h.path} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                    {h.photo && <BlurImage src={h.photo} alt={h.title} fill sizes="(min-width: 640px) 360px, 92vw" className="object-cover" />}
                    <span className="absolute start-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold text-foreground">{i + 1}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[15px] font-medium text-foreground">{h.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {[place(h), h.bedrooms != null ? (card.beds ?? "{n} bd").replace("{n}", String(h.bedrooms)) : null].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    <span className="font-semibold">{formatCurrency(h.cost.headline, lang, h.currency)}</span>{" "}
                    <span className="text-muted-foreground">{h.cost.period === "month" ? card.perMonth ?? "/ month" : card.perNight ?? "/ night"}</span>
                  </p>
                  {h.cost.period === "month" && h.cost.total > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {card.moveIn ?? "Estimated to move in"}: {formatCurrency(h.cost.total, lang, h.currency)}
                      {h.cost.totalHigh > h.cost.total ? ` – ${formatCurrency(h.cost.totalHigh, lang, h.currency)}` : ""}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl gap-2">
          <a
            href={`https://wa.me/${MKAN_WA_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-foreground py-3 text-[15px] font-medium text-background"
          >
            <MessageCircle className="size-4" aria-hidden />
            {sh.continue ?? "Continue on WhatsApp"}
          </a>
          <Link href={`/${lang}/find`} className="flex items-center justify-center rounded-full border px-5 py-3 text-[15px] font-medium text-foreground">
            {sh.newSearch ?? "New search"}
          </Link>
        </div>
      </div>
    </div>
  );
}
