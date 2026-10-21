import type { Metadata } from "next";
import type { Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { db } from "@/lib/db";
import { BrokerOffer, type OfferPageState } from "@/components/agent/broker-offer";
import { needSummary } from "@/components/agent/broker-message";
import { demandAskByToken } from "@/components/agent/demand-actions";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements } from "@/components/agent/requirements";

// A broker sends a home for a tenant's unmet request — no account, the token is the key. Never indexed.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return { title: d.agent?.offer?.metaTitle ?? "Send a home for a tenant", robots: { index: false, follow: false } };
}

export default async function BrokerOfferPage({ params }: { params: Promise<{ lang: Locale; token: string }> }) {
  const { lang, token } = await params;
  const ask = await demandAskByToken(token);
  let state: OfferPageState;
  if (!ask?.tenantRequest) state = { kind: "invalid" };
  else if (ask.tenantRequest.expiresAt < new Date() || !["OPEN", "MATCHED"].includes(ask.tenantRequest.status)) state = { kind: "expired" };
  else {
    const need = needSummary(mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements(ask.tenantRequest.requirements)));
    const sent = await db.listing.count({ where: { sourceListingId: { startsWith: `broker:${ask.id}:` } } });
    state = { kind: "ask", need: lang === "rw" ? need.rw : need.en, sent };
  }
  return (
    <main id="main-content" className="mx-auto min-h-screen w-full max-w-md px-4 py-10">
      <BrokerOffer token={token} state={state} />
    </main>
  );
}
