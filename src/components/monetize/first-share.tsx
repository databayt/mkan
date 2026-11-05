import type { Locale } from "@/components/internationalization/config";
import { formatDate } from "@/lib/i18n/formatters";
import type { FirstShareView } from "@/lib/monetize/first-share-shape";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { INK, LINE, MUTED, Section } from "./listing-ui";

const STAGES = ["featured", "clean", "posted", "views", "contacts", "shortlisted", "asked", "answered", "viewings", "signed", "paidShareRwf"] as const;

const STATUS_TONE: Record<string, string> = {
  POSTED: "bg-[#EBFBF0] text-[#008A05]",
  CLEAN: "bg-[#F7F7F7] text-[#222222]",
  PICKED: "bg-[#F7F7F7] text-[#6A6A6A]",
  REJECTED: "bg-[#FFF8E6] text-[#8A5A00]",
  FAILED: "bg-[#FFF0F3] text-[#C13515]",
};

/**
 * The first share, by numbers: every featured home followed through enhance,
 * post, the people who sent its code, the chatbot's work on them, and who got
 * the home — in total, then one row per listing post.
 */
export function FirstShareSection({ data, labels, locale }: { data: FirstShareView | null; labels: MonetizeLabels; locale: Locale }) {
  const L = labels.firstShare;
  const n = (v: number) => formatValue(v, "count", locale);
  return (
    <Section id="first-share" title={L.title}>
      <p className={cn("-mt-3 mb-6 text-base leading-6", MUTED)}>{L.lead}</p>
      {!data ? (
        <p className={cn("rounded-xl bg-[#F7F7F7] p-4 text-sm dark:bg-muted", INK)}>{L.unknown}</p>
      ) : (
        <>
          <ol className="my-0 ms-0 grid list-none grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {STAGES.map((k, i) => (
              <li key={k} className={cn("rounded-xl border p-3", LINE, k === "signed" && "border-[#222222] dark:border-foreground")}>
                <p className={cn("text-xs", MUTED)}>
                  <span className="tabular-nums">{i + 1}</span> · {L.stages[k]}
                </p>
                <p className={cn("mt-1 text-xl font-semibold tabular-nums", INK)}>{k === "paidShareRwf" ? formatValue(data[k], "rwf", locale) : n(data[k])}</p>
              </li>
            ))}
          </ol>

          <div className={cn("mt-6 space-y-2 text-sm leading-5", INK)}>
            <p>
              <span className="font-semibold">{L.chatbot}: </span>
              {fill(L.chatbotLine, { chats: n(data.chats), shortlisted: n(data.shortlisted), asked: n(data.asked), answered: n(data.answered), failed: n(data.failedChats) })}
            </p>
            {data.rejected > 0 && (
              <p className={MUTED}>{fill(L.rejectedLine, { n: n(data.rejected), why: data.rejectReasons.map((r) => `${r.reason} (${n(r.count)})`).join(", ") })}</p>
            )}
            {data.unattributedChats > 0 && <p className={MUTED}>{fill(L.unattributed, { n: n(data.unattributedChats) })}</p>}
          </div>

          {data.posts.length === 0 ? (
            <p className={cn("mt-6 rounded-xl bg-[#F7F7F7] p-4 text-sm dark:bg-muted", INK)}>{L.empty}</p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className={cn("border-b text-start text-xs", LINE, MUTED)}>
                    <th className="py-2 pe-3 text-start font-medium">{L.table.ref}</th>
                    <th className="py-2 pe-3 text-start font-medium">{L.table.broker}</th>
                    <th className="py-2 pe-3 text-start font-medium">{L.table.status}</th>
                    <th className="py-2 pe-3 text-end font-medium">{L.table.views}</th>
                    <th className="py-2 pe-3 text-end font-medium">{L.table.contacts}</th>
                    <th className="py-2 text-end font-medium">{L.table.deals}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.posts.slice(0, 30).map((p) => {
                    const when = p.postedAt ?? p.pickedAt;
                    return (
                      <tr key={p.id} className={cn("border-b align-top", LINE, INK)}>
                        <td className="py-2 pe-3">
                          {p.tiktokUrl ? (
                            <a href={p.tiktokUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                              {p.ref}
                            </a>
                          ) : (
                            <span className="font-medium">{p.ref}</span>
                          )}
                          <span className={cn("block text-xs", MUTED)}>{formatDate(new Date(when), locale, { year: undefined, month: "short", day: "numeric" })}</span>
                        </td>
                        <td className="py-2 pe-3">{p.brokerHandle ? `@${p.brokerHandle.replace(/^@/, "")}` : "—"}</td>
                        <td className="py-2 pe-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[p.status] ?? STATUS_TONE.PICKED)} title={p.reason ?? undefined}>
                            {(L.status as Record<string, string>)[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="py-2 pe-3 text-end tabular-nums">{p.views == null ? "—" : n(p.views)}</td>
                        <td className="py-2 pe-3 text-end tabular-nums">{n(p.contacts)}</td>
                        <td className="py-2 text-end tabular-nums">
                          {n(p.signed)}
                          {p.paidShareRwf > 0 && <span className={cn("block text-xs", MUTED)}>{formatValue(p.paidShareRwf, "rwf", locale)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
