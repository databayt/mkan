import type { Metadata } from "next";
import type { Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/i18n/formatters";
import { hashToken } from "@/components/agent/broker";
import { BrokerAnswer, type BrokerPageState } from "@/components/agent/broker-answer";

// One-tap answer page for a broker — no account, the token is the key. Never indexed.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return { title: d.agent?.broker?.metaTitle ?? "Answer a tenant's question", robots: { index: false, follow: false } };
}

export default async function BrokerAnswerPage({ params }: { params: Promise<{ lang: Locale; token: string }> }) {
  const { lang, token } = await params;
  const req =
    token.length <= 64
      ? await db.brokerRequest.findUnique({
          where: { tokenHash: hashToken(token) },
          select: {
            status: true,
            expiresAt: true,
            need: true,
            chosenSlot: true,
            visitId: true,
            tenantName: true,
            tenantPhone: true,
            listing: { select: { title: true, photoUrls: true, rentPeriod: true, priceMonth: true, pricePerNight: true, currency: true, location: { select: { address: true } } } },
          },
        })
      : null;

  let state: BrokerPageState;
  if (!req) state = { kind: "invalid" };
  else {
    const l = req.listing;
    const price = l.rentPeriod === "MONTHLY" ? l.priceMonth : l.pricePerNight;
    const home = {
      title: l.title ?? "",
      photo: l.photoUrls[0] ?? null,
      place: l.location?.address ?? null,
      price: price != null ? formatCurrency(price, lang, l.currency) : null,
      period: l.rentPeriod === "MONTHLY" ? ("month" as const) : ("night" as const),
    };
    const summary = (req.need as { summary?: { en?: string; rw?: string } })?.summary;
    const need = (lang === "rw" ? summary?.rw : summary?.en) ?? summary?.en ?? "";
    if (req.visitId && req.chosenSlot) state = { kind: "confirmed", home, when: req.chosenSlot.toISOString(), tenantName: req.tenantName, tenantPhone: req.tenantPhone };
    else if (req.chosenSlot) state = { kind: "chosen", home, when: req.chosenSlot.toISOString() };
    else if (req.status === "PENDING" && req.expiresAt > new Date()) state = { kind: "ask", home, need };
    else if (req.status === "NO_REPLY") state = { kind: "ask", home, need }; // a late answer still counts
    else state = { kind: "answered", home };
  }

  return (
    <main id="main-content" className="mx-auto min-h-screen w-full max-w-md px-4 py-10">
      <BrokerAnswer token={token} state={state} />
    </main>
  );
}
